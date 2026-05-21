import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validateReceipt } from '../../../lib/compliance/receipt/schema';
import { canonicalize } from '../../../lib/compliance/receipt/canonical';
import { verify } from '../../../lib/compliance/receipt/verify';
import type { ComplianceReceipt } from '../../../lib/compliance/receipt/types';

const VECTORS_DIR = join(__dirname, '..', '..', 'vectors');

function loadGoldenReceipt(): ComplianceReceipt {
  return JSON.parse(readFileSync(join(VECTORS_DIR, 'golden-receipt.json'), 'utf8'));
}

function loadGoldenJwksKey(): Buffer {
  const jwks = JSON.parse(readFileSync(join(VECTORS_DIR, 'golden-jwks.json'), 'utf8'));
  const x = jwks.keys[0].x as string;
  return Buffer.from(x, 'base64url');
}

describe('golden receipt fixture', () => {
  it('schema-validates against compliance-receipt.schema.json', () => {
    const result = validateReceipt(loadGoldenReceipt());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('signature verifies via TS verify() against the public key in golden-jwks.json', () => {
    const receipt = loadGoldenReceipt();
    const { receipt_hash: _h, signatures, ...body } = receipt;
    const canonicalBody = canonicalize(body);
    const ok = verify({
      canonicalBytes: canonicalBody,
      signatureHex: signatures[0].signature,
      publicKeyRaw: loadGoldenJwksKey(),
      algorithm: 'ed25519',
    });
    expect(ok).toBe(true);
  });
});
