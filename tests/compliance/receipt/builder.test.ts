import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  buildReceipt,
  computeReceiptHash,
  PENDING_REGULATORY_STATE,
} from '../../../lib/compliance/receipt/builder';
import { validateReceipt } from '../../../lib/compliance/receipt/schema';
import { FileKeyProvider } from '../../../lib/compliance/keys/file-provider';
import type { EvaluationResult } from '../../../types/authzen';

function tmpDir(): string {
  return join(tmpdir(), `agentmarshal-test-${randomBytes(8).toString('hex')}`);
}

function makeEvaluationResult(): EvaluationResult {
  return {
    effect: 'allow',
    evaluation_path: 'declared_scope',
    matched_rule_id: 'rule-001',
    out_of_scope_term: null,
    reason_code: 'OK',
    reason: 'within scope',
    predicate_evaluations: [
      {
        rule_id: 'rule-001',
        predicate_path: 'action.name',
        constraint: { equals: 'send_email' },
        actual_value: 'send_email',
        result: 'pass',
      },
    ],
    composite_evaluations: [
      {
        predicate: 'canspam_unsubscribe_link_present',
        result: 'pass',
        reason: 'unsubscribe header present',
        details: { source: 'list_unsubscribe_header' },
      },
    ],
  };
}

describe('buildReceipt', () => {
  let basePath: string;

  beforeEach(() => {
    basePath = tmpDir();
  });

  afterEach(async () => {
    if (existsSync(basePath)) await fs.rm(basePath, { recursive: true, force: true });
  });

  async function commonInputs() {
    const provider = new FileKeyProvider({ basePath });
    const handle = await provider.getActiveSigningHandle();
    return {
      evaluationResult: makeEvaluationResult(),
      tenantId: 'tenant-1',
      agentId: 'agent-001',
      contractId: 'contract-001',
      contractVersion: '0.1',
      evaluationId: 'eval-1',
      requestId: 'req-1',
      codeVersion: 'test-sha',
      signers: [{ handle, role: 'agentmarshal' as const }],
    };
  }

  it('produces a well-formed receipt with all required fields populated', async () => {
    const receipt = await buildReceipt(await commonInputs());
    expect(receipt.receipt_version).toBe('0.1');
    expect(receipt.schema_version).toBe('0.1');
    expect(receipt.canonical_form).toBe('rfc8785');
    expect(receipt.receipt_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(receipt.receipt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.previous_receipt_hash).toBeNull();
    expect(receipt.signatures).toHaveLength(1);
    expect(receipt.signatures[0].signer_role).toBe('agentmarshal');
    expect(receipt.decision.effect).toBe('allow');
  });

  it('the output passes its own schema (builder self-validation)', async () => {
    const receipt = await buildReceipt(await commonInputs());
    const result = validateReceipt(receipt);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('defaults regulatory_state to PENDING_REGULATORY_STATE when none is provided', async () => {
    const receipt = await buildReceipt(await commonInputs());
    expect(receipt.regulatory_state).toEqual(PENDING_REGULATORY_STATE);
    expect(receipt.regulatory_state.pending).toBe(true);
    expect(receipt.regulatory_state.anchor_method).toBe('pending');
  });

  it('preserves previous_receipt_hash to form a hash chain', async () => {
    const inputs = await commonInputs();
    const previousHash = 'a'.repeat(64);
    const receipt = await buildReceipt({ ...inputs, previousReceiptHash: previousHash });
    expect(receipt.previous_receipt_hash).toBe(previousHash);
  });

  it('propagates composite_evaluations from the EvaluationResult into the receipt', async () => {
    const receipt = await buildReceipt(await commonInputs());
    expect(receipt.composite_evaluations).toHaveLength(1);
    expect(receipt.composite_evaluations[0].predicate).toBe('canspam_unsubscribe_link_present');
    expect(receipt.composite_evaluations[0].result).toBe('pass');
  });

  it('receipt_hash recomputes to the embedded value when re-canonicalized without the hash field', async () => {
    const receipt = await buildReceipt(await commonInputs());
    const { receipt_hash, ...rest } = receipt;
    expect(computeReceiptHash(rest)).toBe(receipt_hash);
  });
});
