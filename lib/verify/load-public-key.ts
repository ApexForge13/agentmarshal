// Loads AgentMarshal's single global Ed25519 public key from the SAME source
// signing uses (FileKeyProvider → data/keys/agentmarshal-public.pem). Exposes
// the raw 32-byte key plus published representations (hex + JWK) for the
// /api/verify/public-key endpoint and the /verify page.
//
// Single global key by design: multi-tenant key separation is post-funding
// (see memory). Do not introduce per-tenant keys here.

import { FileKeyProvider } from '@/lib/compliance/keys/file-provider';
import type { SignatureAlgorithm } from '@/lib/compliance/keys/provider';

export interface PublicKeyJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string; // base64url of the raw 32-byte public key
  alg: 'EdDSA';
  use: 'sig';
}

export interface PublicKeyInfo {
  algorithm: SignatureAlgorithm;
  key_id: string;
  public_key_fingerprint: string;
  raw_hex: string;
  jwk: PublicKeyJwk;
}

let cached: { raw: Buffer; info: PublicKeyInfo } | null = null;

/** Reset the in-process cache. Test-only. */
export function clearPublicKeyCache(): void {
  cached = null;
}

export async function loadPublicKey(): Promise<{ raw: Buffer; info: PublicKeyInfo }> {
  if (cached) return cached;

  const handle = await new FileKeyProvider().getActiveSigningHandle();
  const km = handle.keyMaterial;
  const raw = km.public_key_raw;

  cached = {
    raw,
    info: {
      algorithm: km.algorithm,
      key_id: km.key_id,
      public_key_fingerprint: km.public_key_fingerprint,
      raw_hex: raw.toString('hex'),
      jwk: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: raw.toString('base64url'),
        alg: 'EdDSA',
        use: 'sig',
      },
    },
  };
  return cached;
}
