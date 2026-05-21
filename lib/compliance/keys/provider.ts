// KeyProvider abstraction for Compliance Receipt signing.
// Private key material never leaves the provider; signing happens inside it
// via SigningHandle.sign(canonicalBytes). FileKeyProvider implements this for
// dev/demo; AwsKmsKeyProvider + GcpKmsKeyProvider are stubs that production
// deployments will implement post-funding.

export type SignatureAlgorithm = 'ed25519';

export interface KeyMaterial {
  key_id: string;
  algorithm: SignatureAlgorithm;
  public_key_raw: Buffer;
  public_key_fingerprint: string;
  created_at: string;
}

export interface SigningHandle {
  keyMaterial: KeyMaterial;
  sign(canonicalBytes: Buffer): Promise<Buffer>;
}

export interface KeyProvider {
  getActiveSigningHandle(): Promise<SigningHandle>;
  getPublicKey(key_id: string): Promise<KeyMaterial | null>;
  listKeyIds(): Promise<string[]>;
}

export class NotImplementedError extends Error {
  constructor(milestone: string) {
    super(`Not implemented: ${milestone}`);
    this.name = 'NotImplementedError';
  }
}
