// In-memory KeyRegistry for v0.1.
// Holds multiple KeyMaterial entries with single-active rotation. Exports JWKS
// (RFC 7517 JWK Set) for the future key-distribution endpoint + verifier
// consumption.

import type { KeyMaterial } from './provider';

interface KeyRegistryEntry {
  keyMaterial: KeyMaterial;
  active: boolean;
}

export interface JwksKey {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  kid: string;
}

export interface Jwks {
  keys: JwksKey[];
}

export class KeyRegistry {
  private byKeyId = new Map<string, KeyRegistryEntry>();

  register(keyMaterial: KeyMaterial, active: boolean = false): void {
    if (active) {
      for (const entry of this.byKeyId.values()) entry.active = false;
    }
    this.byKeyId.set(keyMaterial.key_id, { keyMaterial, active });
  }

  setActive(key_id: string): void {
    if (!this.byKeyId.has(key_id)) {
      throw new Error(`KeyRegistry.setActive: unknown key_id ${key_id}`);
    }
    for (const [k, entry] of this.byKeyId) entry.active = k === key_id;
  }

  getActive(): KeyMaterial | null {
    for (const entry of this.byKeyId.values()) {
      if (entry.active) return entry.keyMaterial;
    }
    return null;
  }

  getByKeyId(key_id: string): KeyMaterial | null {
    return this.byKeyId.get(key_id)?.keyMaterial ?? null;
  }

  listKeyIds(): string[] {
    return [...this.byKeyId.keys()];
  }

  exportJWKS(): Jwks {
    const keys: JwksKey[] = [];
    for (const entry of this.byKeyId.values()) {
      keys.push({
        kty: 'OKP',
        crv: 'Ed25519',
        x: entry.keyMaterial.public_key_raw.toString('base64url'),
        kid: entry.keyMaterial.key_id,
      });
    }
    return { keys };
  }
}
