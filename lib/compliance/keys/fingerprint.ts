// Public-key identifiers.
// - publicKeyFingerprint: SHA-256 hex of the raw 32-byte Ed25519 public key.
//   64 lowercase hex chars; for grep-ability and human inspection.
// - jwkThumbprint: RFC 7638 JWK thumbprint, base64url. Interop with JWKS.
// - deriveKeyId: `am-` + jwkThumbprint. The value receipts carry in `key_id`.

import { createHash } from 'crypto';
import { canonicalize } from '@/lib/compliance/receipt/canonical';

export function publicKeyFingerprint(rawPublicKey: Buffer): string {
  return createHash('sha256').update(rawPublicKey).digest('hex');
}

export function jwkThumbprint(rawPublicKey: Buffer): string {
  const jwk = {
    crv: 'Ed25519',
    kty: 'OKP',
    x: rawPublicKey.toString('base64url'),
  };
  const canonical = canonicalize(jwk);
  return createHash('sha256').update(canonical).digest('base64url');
}

export function deriveKeyId(rawPublicKey: Buffer): string {
  return `am-${jwkThumbprint(rawPublicKey)}`;
}
