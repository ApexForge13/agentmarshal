import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { jwkThumbprint, deriveKeyId } from '../../../lib/compliance/keys/fingerprint';

function rawEd25519PublicKey(): Buffer {
  const { publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('expected Ed25519 JWK with x');
  return Buffer.from(jwk.x, 'base64url');
}

describe('jwkThumbprint (RFC 7638) for Ed25519', () => {
  it('is stable across repeated calls on the same key', () => {
    const pub = rawEd25519PublicKey();
    expect(jwkThumbprint(pub)).toBe(jwkThumbprint(pub));
  });

  it('is base64url, decodes to a 32-byte SHA-256 digest, and powers deriveKeyId("am-...")', () => {
    const pub = rawEd25519PublicKey();
    const thumbprint = jwkThumbprint(pub);
    expect(thumbprint).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(thumbprint, 'base64url').length).toBe(32);
    expect(deriveKeyId(pub)).toBe(`am-${thumbprint}`);
  });
});
