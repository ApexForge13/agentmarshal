import { describe, it, expect } from 'vitest';
import { validateReceipt } from '../../../lib/compliance/receipt/schema';
import type { ComplianceReceipt } from '../../../lib/compliance/receipt/types';

function validReceipt(): ComplianceReceipt {
  return {
    receipt_version: '0.1',
    schema_version: '0.1',
    receipt_id: '11111111-2222-4333-8444-555555555555',
    receipt_hash: 'a'.repeat(64),
    previous_receipt_hash: null,
    canonical_form: 'rfc8785',
    issued_at: '2026-05-20T22:00:00.000Z',
    code_version: 'deadbeef',
    contract_id: 'contract-001',
    contract_version: '0.1',
    tenant_id: 'tenant-1',
    agent_id: 'agent-001',
    evaluation_id: 'eval-1',
    request_id: 'req-1',
    decision: {
      effect: 'allow',
      evaluation_path: 'declared_scope',
      matched_rule_id: 'rule-1',
      reason_code: 'OK',
      reason: 'within scope',
    },
    predicate_evaluations: [],
    composite_evaluations: [],
    regulatory_state: {
      hash: null,
      pending: true,
      snapshot_source: null,
      anchor_timestamp: null,
      anchor_method: 'pending',
    },
    signatures: [
      {
        algorithm: 'ed25519',
        key_id: 'am-xxxx',
        public_key_fingerprint: 'b'.repeat(64),
        signature: 'c'.repeat(128),
        signed_at: '2026-05-20T22:00:00.000Z',
        signer_role: 'agentmarshal',
      },
    ],
  };
}

describe('compliance-receipt schema validator', () => {
  it('accepts a fully-populated valid receipt', () => {
    const result = validateReceipt(validReceipt());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a receipt missing the required receipt_id field', () => {
    const r = validReceipt() as Partial<ComplianceReceipt>;
    delete r.receipt_id;
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /receipt_id/.test(e))).toBe(true);
  });

  it('rejects a receipt with an out-of-enum decision.effect', () => {
    const r = validReceipt();
    (r.decision as { effect: string }).effect = 'maybe';
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /\/decision\/effect/.test(e))).toBe(true);
  });

  it('rejects a receipt whose issued_at is not ISO 8601 date-time', () => {
    const r = validReceipt();
    r.issued_at = 'last Tuesday';
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /issued_at|date-time/.test(e))).toBe(true);
  });

  it('rejects a receipt with an unknown top-level field (additionalProperties: false)', () => {
    const r = validReceipt() as unknown as Record<string, unknown>;
    r['surprise_field'] = 'unexpected';
    const result = validateReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /surprise_field|additional/i.test(e))).toBe(true);
  });
});
