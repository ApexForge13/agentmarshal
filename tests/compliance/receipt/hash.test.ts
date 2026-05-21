import { describe, it, expect } from 'vitest';
import { sha256Hex, sha256Base64Url } from '../../../lib/compliance/receipt/hash';

const ABC_SHA256_HEX = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('SHA-256 hash helpers', () => {
  it('sha256Hex matches the NIST "abc" vector and is 64 hex chars', () => {
    const out = sha256Hex(Buffer.from('abc', 'utf8'));
    expect(out).toBe(ABC_SHA256_HEX);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Base64Url of "abc" decodes back to the same 32-byte digest', () => {
    const expectedB64Url = Buffer.from(ABC_SHA256_HEX, 'hex').toString('base64url');
    const out = sha256Base64Url(Buffer.from('abc', 'utf8'));
    expect(out).toBe(expectedB64Url);
    expect(Buffer.from(out, 'base64url').toString('hex')).toBe(ABC_SHA256_HEX);
  });
});
