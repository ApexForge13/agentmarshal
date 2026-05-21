import { describe, it, expect } from 'vitest';
import { AwsKmsKeyProvider } from '../../../lib/compliance/keys/kms-aws';
import { GcpKmsKeyProvider } from '../../../lib/compliance/keys/kms-gcp';
import { NotImplementedError } from '../../../lib/compliance/keys/provider';

describe('KMS key provider stubs', () => {
  it('AwsKmsKeyProvider.getActiveSigningHandle throws NotImplementedError', async () => {
    const provider = new AwsKmsKeyProvider({
      region: 'us-east-1',
      keyArn: 'arn:aws:kms:us-east-1:000000000000:key/00000000-0000-0000-0000-000000000000',
    });
    await expect(provider.getActiveSigningHandle()).rejects.toBeInstanceOf(NotImplementedError);
  });

  it('GcpKmsKeyProvider.getActiveSigningHandle throws NotImplementedError', async () => {
    const provider = new GcpKmsKeyProvider({
      projectId: 'agentmarshal-test',
      locationId: 'us-central1',
      keyRingId: 'compliance-receipts',
      keyId: 'agentmarshal-signing-key',
    });
    await expect(provider.getActiveSigningHandle()).rejects.toBeInstanceOf(NotImplementedError);
  });
});
