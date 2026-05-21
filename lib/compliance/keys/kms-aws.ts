// AwsKmsKeyProvider — production key custody via AWS KMS.
// Stub for v0.1; full implementation lands post-funding when customer
// deployment requires CISO-approved key custody (HSM-backed KMS keys with
// IAM-scoped access).
//
// Architecture target: KMS holds the private key; sign() calls the KMS API;
// verify() uses the returned public key. No private key material lives in
// application memory.

import type { KeyMaterial, KeyProvider, SigningHandle } from './provider';
import { NotImplementedError } from './provider';

export interface AwsKmsKeyProviderOptions {
  region: string;
  keyArn: string;
}

const MILESTONE = 'AWS KMS key custody — post-funding milestone';

export class AwsKmsKeyProvider implements KeyProvider {
  constructor(_options: AwsKmsKeyProviderOptions) {}

  async getActiveSigningHandle(): Promise<SigningHandle> {
    throw new NotImplementedError(MILESTONE);
  }

  async getPublicKey(_key_id: string): Promise<KeyMaterial | null> {
    throw new NotImplementedError(MILESTONE);
  }

  async listKeyIds(): Promise<string[]> {
    throw new NotImplementedError(MILESTONE);
  }
}
