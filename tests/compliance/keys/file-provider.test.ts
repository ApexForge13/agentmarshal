import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { FileKeyProvider } from '../../../lib/compliance/keys/file-provider';

function tmpDir(): string {
  return join(tmpdir(), `agentmarshal-test-${randomBytes(8).toString('hex')}`);
}

describe('FileKeyProvider', () => {
  let basePath: string;

  beforeEach(() => {
    basePath = tmpDir();
  });

  afterEach(async () => {
    if (existsSync(basePath)) await fs.rm(basePath, { recursive: true, force: true });
  });

  it('generates both PEM files on first access when none exist', async () => {
    const provider = new FileKeyProvider({ basePath });
    await provider.getActiveSigningHandle();
    expect(existsSync(join(basePath, 'agentmarshal-private.pem'))).toBe(true);
    expect(existsSync(join(basePath, 'agentmarshal-public.pem'))).toBe(true);
  });

  it('loads existing PEMs and produces a stable fingerprint across provider instances', async () => {
    const first = new FileKeyProvider({ basePath });
    const handleA = await first.getActiveSigningHandle();

    const second = new FileKeyProvider({ basePath });
    const handleB = await second.getActiveSigningHandle();

    expect(handleA.keyMaterial.public_key_fingerprint).toBe(
      handleB.keyMaterial.public_key_fingerprint,
    );
    expect(handleA.keyMaterial.key_id).toBe(handleB.keyMaterial.key_id);
  });

  it('throws a clear error when only one of the two PEM files is present', async () => {
    await fs.mkdir(basePath, { recursive: true });
    await fs.writeFile(join(basePath, 'agentmarshal-private.pem'), 'dummy');
    const provider = new FileKeyProvider({ basePath });
    await expect(provider.getActiveSigningHandle()).rejects.toThrow(
      /missing agentmarshal-public/i,
    );
  });

  it('throws a clear error when PEMs are present but corrupted', async () => {
    await fs.mkdir(basePath, { recursive: true });
    await fs.writeFile(join(basePath, 'agentmarshal-private.pem'), 'not a pem');
    await fs.writeFile(join(basePath, 'agentmarshal-public.pem'), 'also not');
    const provider = new FileKeyProvider({ basePath });
    await expect(provider.getActiveSigningHandle()).rejects.toThrow(/failed to load PEM/i);
  });
});
