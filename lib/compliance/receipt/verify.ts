// Verify an Ed25519 signature over RFC 8785 canonical bytes given the raw
// 32-byte public key. Constructs a Node KeyObject from the raw bytes via the
// JWK form, then defers to Node's built-in verify. Throws only for unsupported
// algorithms; key/signature parsing errors return false.

import { verify as nodeVerify, createPublicKey } from 'crypto';
import type { SignatureAlgorithm } from '@/lib/compliance/keys/provider';

export interface VerifyInput {
  canonicalBytes: Buffer;
  signatureHex: string;
  publicKeyRaw: Buffer;
  algorithm: SignatureAlgorithm;
}

export function verify({
  canonicalBytes,
  signatureHex,
  publicKeyRaw,
  algorithm,
}: VerifyInput): boolean {
  if (algorithm !== 'ed25519') {
    throw new Error(`verify(): unsupported algorithm ${algorithm}`);
  }
  let keyObject;
  try {
    keyObject = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: publicKeyRaw.toString('base64url'),
      },
      format: 'jwk',
    });
  } catch {
    return false;
  }
  try {
    return nodeVerify(null, canonicalBytes, keyObject, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
