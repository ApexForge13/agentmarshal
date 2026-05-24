// Verify an RFC 3161 timestamp token against a receipt's hash.
//
// A token is "timestamped" (trusted) only when ALL hold:
//   1. messageImprint == the receipt's receipt_hash/audit_hash (SHA-256) — the
//      token stamps THIS receipt, not some other datum.
//   2. The messageDigest signed-attribute == digest(TSTInfo) — the signed
//      attributes commit to the TSTInfo we're reading genTime from.
//   3. The CMS SignerInfo signature over the (re-encoded) signedAttrs verifies
//      under the TSA leaf cert's public key.
//   4. The leaf cert chains to the PINNED FreeTSA root (the root embedded in the
//      token is ignored — only ./freetsa-ca.ts is trusted).
//   5. Both certs were temporally valid at genTime.
//
// Any single failure ⇒ { status: 'invalid', reason }. We never throw: a bad token
// is a verdict, not an exception. Crypto is Node's built-in `crypto` only.

import { X509Certificate, createHash, verify as nodeVerify } from 'crypto';
import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { id_messageDigest, type Attribute } from '@peculiar/asn1-cms';
import {
  parseTimeStampToken,
  toArrayBuffer,
  DIGEST_BY_OID,
  SHA256_OID,
} from './tsa-client';
import { freeTsaRoot, FREETSA_TSA_NAME } from './freetsa-ca';
import type { TimestampResult } from './types';

function invalid(reason: string): TimestampResult {
  return { status: 'invalid', reason };
}

function derLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const out: number[] = [];
  let x = n;
  while (x > 0) {
    out.unshift(x & 0xff);
    x >>= 8;
  }
  return Buffer.from([0x80 | out.length, ...out]);
}

// RFC 5652 §5.4: the bytes the TSA signed are the signedAttrs encoded as an
// EXPLICIT `SET OF` (tag 0x31), DER-sorted — NOT the `[0] IMPLICIT` form they
// appear as inside SignerInfo. @peculiar doesn't surface the raw signed bytes,
// so reconstruct them: serialize each Attribute, sort, wrap in SET OF.
function encodeSignedAttrsSetOf(attrs: Attribute[]): Buffer {
  const items = attrs.map((a) => Buffer.from(AsnConvert.serialize(a)));
  items.sort(Buffer.compare);
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x31]), derLen(body.length), body]);
}

const norm = (hex: string) => hex.replace(/^0+/, '').toLowerCase();

export interface VerifyTimestampInput {
  tokenB64: string;
  /** receipt_hash / audit_hash the token must stamp (SHA-256 hex). */
  expectedHashHex: string;
}

/** Verify a present timestamp token. Absence ⇒ 'unavailable' is decided by the
 *  caller; this function only ever returns 'timestamped' or 'invalid'. */
export function verifyTimestampToken({
  tokenB64,
  expectedHashHex,
}: VerifyTimestampInput): TimestampResult {
  try {
    if (!expectedHashHex || !/^[a-f0-9]{64}$/i.test(expectedHashHex)) {
      return invalid('receipt has no valid hash to match the timestamp against');
    }
    const tokenDer = Buffer.from(tokenB64, 'base64');
    const parsed = parseTimeStampToken(tokenDer);
    const { signedData, signerInfo, tstInfoDer, imprintHashHex, imprintAlgOid, genTime } = parsed;

    // 1. Stamped hash == this receipt's hash.
    if (imprintAlgOid !== SHA256_OID) {
      return invalid(`TSA stamped an unexpected hash algorithm (${imprintAlgOid})`);
    }
    if (norm(imprintHashHex) !== norm(expectedHashHex)) {
      return invalid('TSA hash mismatch — token does not timestamp this receipt');
    }

    // Signer digest algorithm (FreeTSA uses SHA-512).
    const digestName = DIGEST_BY_OID[signerInfo.digestAlgorithm.algorithm];
    if (!digestName) {
      return invalid(`unsupported TSA digest algorithm ${signerInfo.digestAlgorithm.algorithm}`);
    }
    const signedAttrs = signerInfo.signedAttrs;
    if (!signedAttrs || signedAttrs.length === 0) {
      return invalid('TSA token has no signed attributes (unsupported token shape)');
    }

    // 2. messageDigest signed attribute == digest(TSTInfo).
    const mdAttr = signedAttrs.find((a) => a.attrType === id_messageDigest);
    if (!mdAttr || mdAttr.attrValues.length === 0) {
      return invalid('TSA token is missing the messageDigest signed attribute');
    }
    const mdValue = Buffer.from(AsnConvert.parse(mdAttr.attrValues[0], OctetString).buffer);
    const eContentHash = createHash(digestName).update(tstInfoDer).digest();
    if (!mdValue.equals(eContentHash)) {
      return invalid('TSA messageDigest attribute does not match the TSTInfo content');
    }

    // Collect embedded certs.
    const certs: X509Certificate[] = (signedData.certificates ?? [])
      .map((c) => (c.certificate ? new X509Certificate(Buffer.from(AsnConvert.serialize(c.certificate))) : null))
      .filter((c): c is X509Certificate => c !== null);
    if (certs.length === 0) {
      return invalid('TSA token carries no certificates to verify against');
    }
    const sidSerial = signerInfo.sid.issuerAndSerialNumber
      ? norm(Buffer.from(signerInfo.sid.issuerAndSerialNumber.serialNumber).toString('hex'))
      : null;
    const leaf =
      certs.find((c) => sidSerial && norm(c.serialNumber) === sidSerial) ??
      certs.find((c) => /TSA/.test(c.subject) && !/Root CA/.test(c.subject)) ??
      certs[0];

    // 3. CMS signature over the re-encoded signedAttrs verifies under the leaf key.
    const signedAttrsDer = encodeSignedAttrsSetOf(signedAttrs);
    const keyType = leaf.publicKey.asymmetricKeyType;
    const alg =
      keyType === 'rsa' || keyType === 'rsa-pss' ? `RSA-${digestName.toUpperCase()}` : digestName;
    const sigOk = nodeVerify(alg, signedAttrsDer, leaf.publicKey, Buffer.from(signerInfo.signature.buffer));
    if (!sigOk) {
      return invalid('TSA signature invalid — token signature did not verify');
    }

    // 4. Leaf chains to the pinned FreeTSA root (token's own root is NOT trusted).
    const root = freeTsaRoot();
    if (!leaf.verify(root.publicKey) || !leaf.checkIssued(root)) {
      return invalid('TSA cert untrusted — does not chain to the pinned FreeTSA root');
    }

    // 5. Both certs temporally valid at genTime.
    const gt = genTime.getTime();
    const validAt = (c: X509Certificate) =>
      new Date(c.validFrom).getTime() <= gt && gt <= new Date(c.validTo).getTime();
    if (!validAt(leaf) || !validAt(root)) {
      return invalid('TSA cert was not temporally valid at the timestamp time');
    }

    return { status: 'timestamped', tsa: FREETSA_TSA_NAME, timestamp_at: genTime.toISOString() };
  } catch (err) {
    return invalid(`timestamp token could not be parsed (${(err as Error).message})`);
  }
}
