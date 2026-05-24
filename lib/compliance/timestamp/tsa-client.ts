// RFC 3161 client: build a TimeStampReq over a receipt hash, POST it to the TSA,
// and parse the TimeStampResp / TimeStampToken (TST). All ASN.1 is handled by the
// @peculiar/asn1-* schema libraries — we never hand-parse DER. The actual crypto
// (X.509, SHA, RSA verify) is Node's built-in `crypto`, the same primitive the
// receipt signer/verifier already use.
//
// The TST is a CMS SignedData (ContentInfo) whose encapsulated content is a
// TSTInfo carrying genTime + the messageImprint (which echoes our hash). Token
// SIGNATURE + cert-chain verification lives in ./verify-timestamp.ts; this module
// owns request construction and structural parsing only.

import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier } from '@peculiar/asn1-x509';
import { TimeStampReq, TimeStampResp, MessageImprint, TSTInfo } from '@peculiar/asn1-tsp';
import { ContentInfo, SignedData, SignerInfo, id_signedData } from '@peculiar/asn1-cms';
import { FREETSA_URL, FREETSA_TSA_NAME } from './freetsa-ca';
import type { Timestamper, TimestampToken } from './types';

export const SHA256_OID = '2.16.840.1.101.3.4.2.1';

/** SignerInfo.digestAlgorithm OID → Node hash name. FreeTSA signs with SHA-512. */
export const DIGEST_BY_OID: Record<string, string> = {
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
  '1.3.14.3.2.26': 'sha1',
};

// RFC 3161 PKIStatus: 0 = granted, 1 = grantedWithMods. Anything else is a refusal.
const PKISTATUS_GRANTED = 0;
const PKISTATUS_GRANTED_WITH_MODS = 1;

const DEFAULT_TIMEOUT_MS = 2000;

/** Raised when a TSA response is malformed or refuses the request. Callers in the
 *  emission path catch this and degrade to "signed but not timestamped". */
export class TsaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TsaError';
  }
}

/** Tight ArrayBuffer slice for a (possibly pooled) Node Buffer. Node Buffers are
 *  ArrayBuffer-backed (never SharedArrayBuffer), so the cast is safe. */
export function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/**
 * Build a DER-encoded TimeStampReq that timestamps `hashHex` (a 32-byte SHA-256
 * hex string — a receipt_hash / audit_hash). The receipt hash is itself a SHA-256
 * digest, so it goes straight into the messageImprint with hashAlgorithm = SHA-256;
 * there is no second hashing. certReq=true asks the TSA to embed its signing cert.
 * No nonce: replay is already defeated by checking the returned imprint == our hash.
 */
export function buildTimeStampRequest(hashHex: string): Buffer {
  const hashBytes = Buffer.from(hashHex, 'hex');
  if (hashBytes.length !== 32) {
    throw new Error(
      `buildTimeStampRequest: expected a 32-byte SHA-256 hex string, got ${hashBytes.length} bytes`,
    );
  }
  const req = new TimeStampReq({
    version: 1,
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({ algorithm: SHA256_OID, parameters: null }),
      hashedMessage: new OctetString(toArrayBuffer(hashBytes)),
    }),
    certReq: true,
  });
  return Buffer.from(AsnConvert.serialize(req));
}

export interface ParsedTimestampToken {
  signedData: SignedData;
  signerInfo: SignerInfo;
  tstInfo: TSTInfo;
  tstInfoDer: Buffer;
  /** Hex of the messageImprint hashedMessage — the hash the TSA actually stamped. */
  imprintHashHex: string;
  /** OID of the messageImprint hash algorithm (expected SHA-256 for our requests). */
  imprintAlgOid: string;
  genTime: Date;
}

/** Structurally parse a DER TimeStampToken (CMS ContentInfo) down to its TSTInfo.
 *  Does NOT verify signatures — see verify-timestamp.ts. Throws TsaError on shape. */
export function parseTimeStampToken(tokenDer: Buffer): ParsedTimestampToken {
  const ci = AsnConvert.parse(toArrayBuffer(tokenDer), ContentInfo);
  if (ci.contentType !== id_signedData) {
    throw new TsaError(`timestamp token contentType ${ci.contentType} is not id-signedData`);
  }
  const signedData = AsnConvert.parse(ci.content, SignedData);
  if (signedData.signerInfos.length === 0) {
    throw new TsaError('timestamp token SignedData has no signerInfos');
  }
  const ec = signedData.encapContentInfo.eContent;
  const eBytes = ec?.single?.buffer ?? ec?.any;
  if (!eBytes) throw new TsaError('timestamp token has no encapsulated TSTInfo content');
  const tstInfoDer = Buffer.from(eBytes);
  const tstInfo = AsnConvert.parse(toArrayBuffer(tstInfoDer), TSTInfo);
  return {
    signedData,
    signerInfo: signedData.signerInfos[0],
    tstInfo,
    tstInfoDer,
    imprintHashHex: Buffer.from(tstInfo.messageImprint.hashedMessage.buffer).toString('hex'),
    imprintAlgOid: tstInfo.messageImprint.hashAlgorithm.algorithm,
    genTime: tstInfo.genTime,
  };
}

export interface ParsedTimestampResponse {
  tokenDer: Buffer;
  genTime: Date;
  imprintHashHex: string;
  imprintAlgOid: string;
}

/** Parse a DER TimeStampResp: assert the TSA granted the request and extract the
 *  embedded token (re-serialized to DER for storage) plus its genTime + imprint. */
export function parseTimeStampResponse(der: Buffer): ParsedTimestampResponse {
  const resp = AsnConvert.parse(toArrayBuffer(der), TimeStampResp);
  const status = resp.status.status as number;
  if (status !== PKISTATUS_GRANTED && status !== PKISTATUS_GRANTED_WITH_MODS) {
    const detail = resp.status.statusString?.join('; ');
    throw new TsaError(
      `TSA refused the request (PKIStatus ${status}${detail ? `: ${detail}` : ''})`,
    );
  }
  if (!resp.timeStampToken) {
    throw new TsaError('TSA granted the request but returned no timeStampToken');
  }
  const tokenDer = Buffer.from(AsnConvert.serialize(resp.timeStampToken));
  const parsed = parseTimeStampToken(tokenDer);
  return {
    tokenDer,
    genTime: parsed.genTime,
    imprintHashHex: parsed.imprintHashHex,
    imprintAlgOid: parsed.imprintAlgOid,
  };
}

export interface FreeTsaTimestamperOptions {
  /** Override the TSA endpoint (tests / alternate TSAs). Defaults to FreeTSA. */
  url?: string;
  /** Request timeout in ms. Defaults to 2000 (degradation policy). */
  timeoutMs?: number;
}

/**
 * Production timestamper. Submits the receipt hash to FreeTSA over HTTPS with a
 * short timeout and returns a TimestampToken, or null on ANY failure (timeout,
 * non-200, TSA refusal, malformed response). Never throws: a TSA outage must
 * degrade to an un-timestamped-but-still-signed receipt, never break emission.
 */
export function createFreeTsaTimestamper(opts: FreeTsaTimestamperOptions = {}): Timestamper {
  const url = opts.url ?? FREETSA_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Hard rule: automated tests MUST NOT depend on TSA uptime. Under vitest (or an
  // explicit opt-out) the production factory is a no-op — tests that exercise real
  // timestamping inject captured-token replays instead. The live network path is
  // covered by scripts/check-freetsa.mts and the gated capture test, never CI.
  const offline = !!process.env.VITEST || process.env.AGENTMARSHAL_TSA_OFFLINE === '1';
  return {
    async timestamp(hashHex: string): Promise<TimestampToken | null> {
      if (offline) return null;
      try {
        const reqDer = buildTimeStampRequest(hashHex);
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/timestamp-query' },
          body: new Uint8Array(reqDer),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!resp.ok) {
          console.warn(
            `[timestamp] TSA ${url} returned HTTP ${resp.status}; receipt will not be externally timestamped`,
          );
          return null;
        }
        const respDer = Buffer.from(await resp.arrayBuffer());
        const parsed = parseTimeStampResponse(respDer);
        return {
          tsa: FREETSA_TSA_NAME,
          token_b64: parsed.tokenDer.toString('base64'),
          issued_at: parsed.genTime.toISOString(),
        };
      } catch (err) {
        console.warn(
          `[timestamp] TSA request to ${url} failed (${(err as Error).message}); receipt will not be externally timestamped`,
        );
        return null;
      }
    },
  };
}
