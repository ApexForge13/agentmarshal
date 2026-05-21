import { describe, it, expect } from 'vitest';
import { KeyRegistry } from '../../../lib/compliance/keys/key-registry';
import type { KeyMaterial } from '../../../lib/compliance/keys/provider';

function makeKey(id: string, byte: number = 0xab): KeyMaterial {
  return {
    key_id: id,
    algorithm: 'ed25519',
    public_key_raw: Buffer.alloc(32, byte),
    public_key_fingerprint: '00'.repeat(32),
    created_at: '2026-05-20T00:00:00Z',
  };
}

describe('KeyRegistry', () => {
  it('register + lookup by key_id returns the registered KeyMaterial', () => {
    const registry = new KeyRegistry();
    const km = makeKey('am-test-1');
    registry.register(km, true);
    expect(registry.getByKeyId('am-test-1')).toEqual(km);
    expect(registry.getActive()).toEqual(km);
    expect(registry.listKeyIds()).toEqual(['am-test-1']);
  });

  it('returns null for unknown key_id and when no key is active', () => {
    const registry = new KeyRegistry();
    expect(registry.getByKeyId('am-unknown')).toBeNull();
    expect(registry.getActive()).toBeNull();
  });

  it('exportJWKS produces an RFC 7517 JWK Set with one entry per registered key', () => {
    const registry = new KeyRegistry();
    registry.register(makeKey('am-test-1', 0x01), true);
    registry.register(makeKey('am-test-2', 0x02), false);
    const jwks = registry.exportJWKS();
    expect(jwks.keys).toHaveLength(2);
    for (const k of jwks.keys) {
      expect(k.kty).toBe('OKP');
      expect(k.crv).toBe('Ed25519');
      expect(typeof k.x).toBe('string');
      expect(typeof k.kid).toBe('string');
    }
    expect(jwks.keys.map((k) => k.kid).sort()).toEqual(['am-test-1', 'am-test-2']);
  });
});
