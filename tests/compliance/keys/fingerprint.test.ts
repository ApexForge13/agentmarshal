import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { publicKeyFingerprint } from '../../../lib/compliance/keys/fingerprint';

function rawEd25519PublicKey(): Buffer {
  const { publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('expected Ed25519 JWK with x');
  return Buffer.from(jwk.x, 'base64url');
}

describe('publicKeyFingerprint (SHA-256 hex of raw Ed25519 public key)', () => {
  it('is stable across repeated calls on the same key', () => {
    const pub = rawEd25519PublicKey();
    expect(publicKeyFingerprint(pub)).toBe(publicKeyFingerprint(pub));
  });

  it('differs for different keys', () => {
    const fp1 = publicKeyFingerprint(rawEd25519PublicKey());
    const fp2 = publicKeyFingerprint(rawEd25519PublicKey());
    expect(fp1).not.toBe(fp2);
  });

  it('is 64 lowercase hex chars (SHA-256)', () => {
    expect(publicKeyFingerprint(rawEd25519PublicKey())).toMatch(/^[0-9a-f]{64}$/);
  });
});
