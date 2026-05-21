// GcpKmsKeyProvider — production key custody via Google Cloud KMS.
// Stub for v0.1; full implementation lands post-funding alongside the AWS KMS
// provider. Same architecture target: KMS holds the private key; signing
// happens via the KMS API; no private key material in application memory.

import type { KeyMaterial, KeyProvider, SigningHandle } from './provider';
import { NotImplementedError } from './provider';

export interface GcpKmsKeyProviderOptions {
  projectId: string;
  locationId: string;
  keyRingId: string;
  keyId: string;
}

const MILESTONE = 'GCP KMS key custody — post-funding milestone';

export class GcpKmsKeyProvider implements KeyProvider {
  constructor(_options: GcpKmsKeyProviderOptions) {}

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
