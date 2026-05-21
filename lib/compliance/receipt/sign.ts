// Sign canonical bytes via a SigningHandle. Returns the algorithm-tagged
// signature shape that receipts embed. Private key never enters this module —
// the handle owns the secret and returns raw signature bytes.

import type { SigningHandle, SignatureAlgorithm } from '@/lib/compliance/keys/provider';

export interface Signature {
  signature_hex: string;
  algorithm: SignatureAlgorithm;
  key_id: string;
  public_key_fingerprint: string;
}

export async function sign(canonicalBytes: Buffer, handle: SigningHandle): Promise<Signature> {
  const sigBytes = await handle.sign(canonicalBytes);
  return {
    signature_hex: sigBytes.toString('hex'),
    algorithm: handle.keyMaterial.algorithm,
    key_id: handle.keyMaterial.key_id,
    public_key_fingerprint: handle.keyMaterial.public_key_fingerprint,
  };
}
