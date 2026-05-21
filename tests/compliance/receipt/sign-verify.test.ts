import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { FileKeyProvider } from '../../../lib/compliance/keys/file-provider';
import { sign } from '../../../lib/compliance/receipt/sign';
import { verify } from '../../../lib/compliance/receipt/verify';

function tmpDir(): string {
  return join(tmpdir(), `agentmarshal-test-${randomBytes(8).toString('hex')}`);
}

describe('sign + verify (Ed25519 over canonical bytes)', () => {
  let basePathA: string;
  let basePathB: string;

  beforeEach(() => {
    basePathA = tmpDir();
    basePathB = tmpDir();
  });

  afterEach(async () => {
    for (const p of [basePathA, basePathB]) {
      if (existsSync(p)) await fs.rm(p, { recursive: true, force: true });
    }
  });

  it('sign produces a 128-hex-char Ed25519 signature with algorithm + key metadata', async () => {
    const provider = new FileKeyProvider({ basePath: basePathA });
    const handle = await provider.getActiveSigningHandle();
    const signature = await sign(Buffer.from('payload'), handle);
    expect(signature.signature_hex).toMatch(/^[0-9a-f]{128}$/);
    expect(signature.algorithm).toBe('ed25519');
    expect(signature.key_id).toBe(handle.keyMaterial.key_id);
    expect(signature.public_key_fingerprint).toBe(handle.keyMaterial.public_key_fingerprint);
  });

  it('sign + verify round-trip succeeds on the original payload', async () => {
    const provider = new FileKeyProvider({ basePath: basePathA });
    const handle = await provider.getActiveSigningHandle();
    const payload = Buffer.from('the canonical bytes go here');
    const signature = await sign(payload, handle);
    expect(
      verify({
        canonicalBytes: payload,
        signatureHex: signature.signature_hex,
        publicKeyRaw: handle.keyMaterial.public_key_raw,
        algorithm: 'ed25519',
      }),
    ).toBe(true);
  });

  it('verify rejects a tampered payload', async () => {
    const provider = new FileKeyProvider({ basePath: basePathA });
    const handle = await provider.getActiveSigningHandle();
    const payload = Buffer.from('original');
    const signature = await sign(payload, handle);
    const tampered = Buffer.from('original!');
    expect(
      verify({
        canonicalBytes: tampered,
        signatureHex: signature.signature_hex,
        publicKeyRaw: handle.keyMaterial.public_key_raw,
        algorithm: 'ed25519',
      }),
    ).toBe(false);
  });

  it('verify rejects when supplied with the wrong public key', async () => {
    const providerA = new FileKeyProvider({ basePath: basePathA });
    const handleA = await providerA.getActiveSigningHandle();
    const providerB = new FileKeyProvider({ basePath: basePathB });
    const handleB = await providerB.getActiveSigningHandle();
    const payload = Buffer.from('signed by A');
    const signature = await sign(payload, handleA);
    expect(
      verify({
        canonicalBytes: payload,
        signatureHex: signature.signature_hex,
        publicKeyRaw: handleB.keyMaterial.public_key_raw,
        algorithm: 'ed25519',
      }),
    ).toBe(false);
  });
});
