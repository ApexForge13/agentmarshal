import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  buildReceipt,
  computeReceiptHash,
} from '../../../lib/compliance/receipt/builder';
import { canonicalize } from '../../../lib/compliance/receipt/canonical';
import { verify } from '../../../lib/compliance/receipt/verify';
import { FileKeyProvider } from '../../../lib/compliance/keys/file-provider';
import type { ComplianceReceipt } from '../../../lib/compliance/receipt/types';
import type { SigningHandle } from '../../../lib/compliance/keys/provider';
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
    predicate_evaluations: [],
    composite_evaluations: [],
  };
}

function bodyOf(receipt: ComplianceReceipt): Omit<ComplianceReceipt, 'receipt_hash' | 'signatures'> {
  const { receipt_hash: _h, signatures: _s, ...body } = receipt;
  return body;
}

function verifySignature(receipt: ComplianceReceipt, sigIndex: number, handle: SigningHandle): boolean {
  return verify({
    canonicalBytes: canonicalize(bodyOf(receipt)),
    signatureHex: receipt.signatures[sigIndex].signature,
    publicKeyRaw: handle.keyMaterial.public_key_raw,
    algorithm: 'ed25519',
  });
}

describe('Compliance Receipt end-to-end (build + verify)', () => {
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

  it('build + verify single-signature round-trip succeeds', async () => {
    const provider = new FileKeyProvider({ basePath: basePathA });
    const handle = await provider.getActiveSigningHandle();
    const receipt = await buildReceipt({
      evaluationResult: makeEvaluationResult(),
      tenantId: 't', agentId: 'a', contractId: 'c', contractVersion: '0.1',
      evaluationId: 'e', requestId: 'r', codeVersion: 'sha',
      signers: [{ handle, role: 'agentmarshal' }],
    });
    expect(verifySignature(receipt, 0, handle)).toBe(true);
  });

  it('verify fails after a body field is tampered post-signing', async () => {
    const provider = new FileKeyProvider({ basePath: basePathA });
    const handle = await provider.getActiveSigningHandle();
    const receipt = await buildReceipt({
      evaluationResult: makeEvaluationResult(),
      tenantId: 't', agentId: 'a', contractId: 'c', contractVersion: '0.1',
      evaluationId: 'e', requestId: 'r', codeVersion: 'sha',
      signers: [{ handle, role: 'agentmarshal' }],
    });
    const tampered: ComplianceReceipt = {
      ...receipt,
      decision: { ...receipt.decision, reason: 'tampered reason' },
    };
    expect(verifySignature(tampered, 0, handle)).toBe(false);
  });

  it('receipt_hash integrity check detects a tampered receipt_hash', async () => {
    const provider = new FileKeyProvider({ basePath: basePathA });
    const handle = await provider.getActiveSigningHandle();
    const receipt = await buildReceipt({
      evaluationResult: makeEvaluationResult(),
      tenantId: 't', agentId: 'a', contractId: 'c', contractVersion: '0.1',
      evaluationId: 'e', requestId: 'r', codeVersion: 'sha',
      signers: [{ handle, role: 'agentmarshal' }],
    });
    const tampered: ComplianceReceipt = { ...receipt, receipt_hash: 'b'.repeat(64) };
    const { receipt_hash, ...rest } = tampered;
    const recomputed = computeReceiptHash(rest);
    expect(recomputed).not.toBe(receipt_hash);
    expect(recomputed).toBe(receipt.receipt_hash);
  });

  it('build with 2 signers (different roles) produces two signatures that both verify', async () => {
    const providerA = new FileKeyProvider({ basePath: basePathA });
    const providerB = new FileKeyProvider({ basePath: basePathB });
    const handleA = await providerA.getActiveSigningHandle();
    const handleB = await providerB.getActiveSigningHandle();
    const receipt = await buildReceipt({
      evaluationResult: makeEvaluationResult(),
      tenantId: 't', agentId: 'a', contractId: 'c', contractVersion: '0.1',
      evaluationId: 'e', requestId: 'r', codeVersion: 'sha',
      signers: [
        { handle: handleA, role: 'agentmarshal' },
        { handle: handleB, role: 'operator' },
      ],
    });
    expect(receipt.signatures).toHaveLength(2);
    expect(receipt.signatures[0].signer_role).toBe('agentmarshal');
    expect(receipt.signatures[1].signer_role).toBe('operator');
    expect(verifySignature(receipt, 0, handleA)).toBe(true);
    expect(verifySignature(receipt, 1, handleB)).toBe(true);
  });
});
