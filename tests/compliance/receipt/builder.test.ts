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
import { canonicalize } from '../../../lib/compliance/receipt/canonical';
import { verify } from '../../../lib/compliance/receipt/verify';
import { FileKeyProvider } from '../../../lib/compliance/keys/file-provider';
import type { EvaluationResult, BDCallAudit, BDService } from '../../../types/authzen';

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

  it('validates a receipt whose bd_calls span every Bright Data service, incl. crawl_api (Bubble 19 regression)', async () => {
    // Guards the compliance-receipt schema bd_calls.service enum against BDService drift
    // (the sibling fix to the internal-audit-record schema; crawl_api was missing from
    // both record schemas until Bubble 19).
    const allServices: BDService[] = [
      'serp_api',
      'web_unlocker',
      'scraping_browser',
      'web_scraper_api',
      'proxies',
      'scraper_studio',
      'mcp_server',
      'crawl_api',
    ];
    const bdCall = (service: BDService): BDCallAudit => ({
      service,
      tool: 'scrape_url',
      parameters: { url: 'https://example.com' },
      matched_rule_id: 'rule-x',
      governance_result: 'permit',
      composite_outcomes: [],
      executed_at: '2026-05-27T00:00:00.000Z',
      duration_ms: 5,
      response_sha256: 'a'.repeat(64),
      response_size_bytes: 100,
      bd_request_id: null,
    });

    const receipt = await buildReceipt({ ...(await commonInputs()), bdCalls: allServices.map(bdCall) });

    expect(receipt.bd_calls).toHaveLength(allServices.length);
    expect(receipt.bd_calls?.map((c) => c.service)).toEqual(allServices);
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

  it('LLM-shaped composite: reasoning string + concerns + model ride the signed body; sig + tamper-detection verify (Bubble 23 regression)', async () => {
    // Mirrors the Bubble 23 internal-audit regression. The TradingAgent's
    // adverse-media evaluation emits an Internal Audit (TradingAgent falls back
    // to COO, non-customer-touching) — but the same composite_evaluations shape
    // also rides Compliance Receipts emitted by customer-touching agents that
    // run an LLM-scored composite, so the receipt builder needs the same
    // canonical-bytes invariant pinned. If a future refactor drops the LLM
    // fields from the signed receipt body, this fails loudly.
    const REASONING =
      'SEC indicted Helix Bridge Capital Partners for fraud and money laundering, along with regulatory actions including asset freezes and operating bans.';
    const CONCERNS = ['SEC indictment', 'fraud', 'money laundering', 'asset freeze'];
    const MODEL = 'gpt-4.1-mini-2025-04-14';

    const provider = new FileKeyProvider({ basePath });
    const handle = await provider.getActiveSigningHandle();
    const llmShapedResult: EvaluationResult = {
      effect: 'deny',
      evaluation_path: 'declared_scope',
      matched_rule_id: 'rule-001',
      out_of_scope_term: null,
      reason_code: 'COMPOSITE_FAIL',
      reason: 'adverse media composite returned fail',
      predicate_evaluations: [],
      composite_evaluations: [
        {
          predicate: 'entity_adverse_media_check',
          result: 'fail',
          reason: REASONING,
          details: {
            scoring_path: 'llm',
            scoring_mode: 'llm_with_keyword_fallback',
            llm_verdict: 'fail',
            llm_reasoning: REASONING,
            llm_concerns: CONCERNS,
            llm_model: MODEL,
            llm_content_truncated: false,
            llm_content_chars_sent: 410,
            llm_credits_used: 677,
            llm_usd_spent: 0.0003385,
          },
        },
      ],
    };

    const receipt = await buildReceipt({
      evaluationResult: llmShapedResult,
      tenantId: 'tenant-1',
      agentId: 'agent-001',
      contractId: 'contract-001',
      contractVersion: '0.1',
      evaluationId: 'eval-llm-1',
      requestId: 'req-llm-1',
      codeVersion: 'test-sha',
      signers: [{ handle, role: 'agentmarshal' as const }],
    });

    // (a) The reasoning sentence, every concern, the model name, and the
    // scoring mode all ride inside the canonical bytes the signature covers.
    const { receipt_hash, signatures, timestamp_token: _ts, ...body } = receipt;
    void _ts;
    const canonicalBody = canonicalize(body).toString('utf-8');
    expect(canonicalBody).toContain(REASONING);
    for (const concern of CONCERNS) expect(canonicalBody).toContain(concern);
    expect(canonicalBody).toContain(MODEL);
    expect(canonicalBody).toContain('llm_with_keyword_fallback');
    expect(canonicalBody).toContain('"scoring_path":"llm"');

    // (b) Ed25519 signature verifies against the canonical body.
    const sig = signatures[0];
    const keyMaterial = await provider.getPublicKey(sig.key_id);
    expect(keyMaterial).not.toBeNull();
    const sigOk = verify({
      canonicalBytes: canonicalize(body),
      signatureHex: sig.signature,
      publicKeyRaw: keyMaterial!.public_key_raw,
      algorithm: sig.algorithm,
    });
    expect(sigOk).toBe(true);

    // (c) receipt_hash recomputes from body + signatures.
    expect(computeReceiptHash({ ...body, signatures })).toBe(receipt_hash);

    // (d) Tampering with the reasoning flips signature verification: the LLM
    // reasoning string is inside the bytes the signature covers, not appended
    // post-signing.
    const tamperedBody = JSON.parse(JSON.stringify(body)) as typeof body;
    const tamperedAmc = (tamperedBody.composite_evaluations ?? []).find(
      (c) => c.predicate === 'entity_adverse_media_check',
    );
    if (tamperedAmc) tamperedAmc.reason = 'tampered';
    const tamperedOk = verify({
      canonicalBytes: canonicalize(tamperedBody),
      signatureHex: sig.signature,
      publicKeyRaw: keyMaterial!.public_key_raw,
      algorithm: sig.algorithm,
    });
    expect(tamperedOk).toBe(false);

    // (e) Hash-chain link: a follow-on receipt carries previous_receipt_hash.
    const followon = await buildReceipt({
      evaluationResult: llmShapedResult,
      tenantId: 'tenant-1',
      agentId: 'agent-001',
      contractId: 'contract-001',
      contractVersion: '0.1',
      evaluationId: 'eval-llm-2',
      requestId: 'req-llm-2',
      codeVersion: 'test-sha',
      signers: [{ handle, role: 'agentmarshal' as const }],
      previousReceiptHash: receipt.receipt_hash,
    });
    expect(followon.previous_receipt_hash).toBe(receipt.receipt_hash);
    const { receipt_hash: followonHash, ...followonRest } = followon;
    expect(computeReceiptHash(followonRest)).toBe(followonHash);
  });
});
