import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import {
  buildInternalAuditRecord,
  computeAuditHash,
  PENDING_REGULATORY_STATE,
} from '../../../lib/compliance/internal-audit/builder';
import { validateInternalAuditRecord } from '../../../lib/compliance/internal-audit/schema';
import { canonicalize } from '../../../lib/compliance/receipt/canonical';
import { verify } from '../../../lib/compliance/receipt/verify';
import { FileKeyProvider } from '../../../lib/compliance/keys/file-provider';
import type { EvaluationResult, BDCallAudit, BDService } from '../../../types/authzen';

function tmpDir(): string {
  return join(tmpdir(), `agentmarshal-test-${randomBytes(8).toString('hex')}`);
}

function makeAllowEvaluationResult(): EvaluationResult {
  return {
    effect: 'allow',
    evaluation_path: 'declared_scope',
    matched_rule_id: 'rule-internal-001',
    out_of_scope_term: null,
    reason_code: 'OK',
    reason: 'internal action permitted',
    predicate_evaluations: [
      {
        rule_id: 'rule-internal-001',
        predicate_path: 'action.name',
        constraint: { equals: 'pipeline_buffer_adjusted' },
        actual_value: 'pipeline_buffer_adjusted',
        result: 'pass',
      },
    ],
    composite_evaluations: [
      {
        predicate: 'pipeline_buffer_within_target_band',
        result: 'pass',
        reason: 'buffer healthy',
        details: { current_buffer_count: 6400, band: '3200-9500' },
      },
    ],
  };
}

function makeStubBlockedEvaluationResult(): EvaluationResult {
  return {
    effect: 'deny',
    evaluation_path: 'declared_scope',
    matched_rule_id: 'rule-internal-001',
    out_of_scope_term: null,
    reason_code: 'COMPOSITE_STUB',
    reason: 'one or more composite predicates returned stub; fail-safe blocked allow',
    predicate_evaluations: [],
    composite_evaluations: [
      {
        predicate: 'pull_rate_calibrated_to_send_rate',
        result: 'stub',
        reason: 'pull-plan calibration check not yet implemented',
        details: { deferred_to: 'COO pipeline controller integration' },
      },
    ],
  };
}

describe('buildInternalAuditRecord', () => {
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
      provider,
      input: {
        evaluationResult: makeAllowEvaluationResult(),
        tenantId: 'tenant-1',
        evaluationId: 'eval-internal-1',
        requestId: 'internal-req-1',
        agent: {
          id: 'coo-001',
          type: 'COO' as const,
          version: '0.1.0',
        },
        action: {
          type: 'pipeline_buffer_adjusted',
          inputs: { current_buffer_count: 6400, send_rate_target: 1500 },
          outputs: { new_pull_plan: 1700, projected_buffer_eod: 6500 },
        },
        contract: {
          id: 'contract-coo-001',
          version: '0.1',
        },
        codeVersion: 'test-sha',
        signers: [{ handle, role: 'agentmarshal' as const }],
      },
    };
  }

  it('produces a well-formed audit record with all required fields populated', async () => {
    const { input } = await commonInputs();
    const record = await buildInternalAuditRecord(input);
    expect(record.internal_audit_version).toBe('0.1');
    expect(record.schema_version).toBe('0.1');
    expect(record.record_type).toBe('internal_audit');
    expect(record.canonical_form).toBe('rfc8785');
    expect(record.record_id).toMatch(/^ia-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(record.audit_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.previous_audit_hash).toBeNull();
    expect(record.signatures).toHaveLength(1);
    expect(record.signatures[0].signer_role).toBe('agentmarshal');
    expect(record.agent.type).toBe('COO');
    expect(record.action.type).toBe('pipeline_buffer_adjusted');
    expect(record.evaluation.decision.effect).toBe('allow');
  });

  it('the output passes its own schema (builder self-validation)', async () => {
    const { input } = await commonInputs();
    const record = await buildInternalAuditRecord(input);
    const result = validateInternalAuditRecord(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validates a record whose bd_calls span every Bright Data service, incl. crawl_api (Bubble 19 regression)', async () => {
    // Guards the internal-audit-record schema bd_calls.service enum against drift from
    // the BDService union. Bubble 18 added crawl_api to the scope-contract schema + the
    // TS union but not the record schemas; a real crawl_api bd_call (Bubble 19 v1) then
    // failed buildInternalAuditRecord's self-validation. This pins every service.
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

    const { input } = await commonInputs();
    const record = await buildInternalAuditRecord({ ...input, bdCalls: allServices.map(bdCall) });

    expect(record.bd_calls).toHaveLength(allServices.length);
    expect(record.bd_calls?.map((c) => c.service)).toEqual(allServices);
    const result = validateInternalAuditRecord(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('defaults regulatory_state to PENDING_REGULATORY_STATE when none is provided', async () => {
    const { input } = await commonInputs();
    const record = await buildInternalAuditRecord(input);
    expect(record.regulatory_state).toEqual(PENDING_REGULATORY_STATE);
    expect(record.regulatory_state.pending).toBe(true);
    expect(record.regulatory_state.anchor_method).toBe('pending');
  });

  it('forms a hash chain across two records via previous_audit_hash', async () => {
    const { input } = await commonInputs();
    const first = await buildInternalAuditRecord(input);
    const second = await buildInternalAuditRecord({
      ...input,
      previousAuditHash: first.audit_hash,
    });
    expect(second.previous_audit_hash).toBe(first.audit_hash);
    expect(second.previous_audit_hash).not.toBe(second.audit_hash);
  });

  it('propagates a stub composite evaluation with decision.effect deny', async () => {
    const { input } = await commonInputs();
    const stubInput = {
      ...input,
      evaluationResult: makeStubBlockedEvaluationResult(),
    };
    const record = await buildInternalAuditRecord(stubInput);
    expect(record.evaluation.decision.effect).toBe('deny');
    expect(record.evaluation.composite_evaluations).toHaveLength(1);
    expect(record.evaluation.composite_evaluations[0].result).toBe('stub');
    expect(record.evaluation.decision.reason_code).toBe('COMPOSITE_STUB');
  });

  it('audit_hash recomputes to the embedded value when re-canonicalized without the hash field', async () => {
    const { input } = await commonInputs();
    const record = await buildInternalAuditRecord(input);
    const { audit_hash, ...rest } = record;
    expect(computeAuditHash(rest)).toBe(audit_hash);
  });

  it('the signature verifies against the canonical signed payload', async () => {
    const { provider, input } = await commonInputs();
    const record = await buildInternalAuditRecord(input);
    const { audit_hash: _hash, signatures, ...body } = record;
    void _hash;
    const canonicalBytes = canonicalize(body);
    const sig = signatures[0];
    const keyMaterial = await provider.getPublicKey(sig.key_id);
    expect(keyMaterial).not.toBeNull();
    const ok = verify({
      canonicalBytes,
      signatureHex: sig.signature,
      publicKeyRaw: keyMaterial!.public_key_raw,
      algorithm: sig.algorithm,
    });
    expect(ok).toBe(true);
  });

  it('rejects an empty signers array', async () => {
    const { input } = await commonInputs();
    const noSigners = { ...input, signers: [] };
    await expect(buildInternalAuditRecord(noSigners)).rejects.toThrow(/at least one signer/);
  });

  it('LLM-shaped composite: reasoning string + concerns + model ride the signed body; sig + chain verify (Bubble 23 regression)', async () => {
    // Pins the Bubble 22 claim: every signed audit record carries the LLM's
    // human-readable justification end-to-end. Bubble 22 tested the LLM scorer in
    // isolation and the composite at the result/details level; nothing exercised
    // the path through builder -> Ed25519 sign -> verify. Bubble 19 proved this
    // class of path can have gaps hermetic tests miss (the crawl_api enum bug
    // surfaced only on a real eval). This pins reasoning + concerns + model into
    // the canonical signed bytes so a future refactor that drops any of them
    // breaks loudly here, not silently in production.
    const REASONING =
      'SEC indicted Helix Bridge Capital Partners for fraud and money laundering, along with regulatory actions including asset freezes and operating bans.';
    const CONCERNS = ['SEC indictment', 'fraud', 'money laundering', 'asset freeze'];
    const MODEL = 'gpt-4.1-mini-2025-04-14';

    const { provider, input } = await commonInputs();
    const llmShapedResult: EvaluationResult = {
      effect: 'deny',
      evaluation_path: 'declared_scope',
      matched_rule_id: 'trading-v1-base',
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

    const record = await buildInternalAuditRecord({
      ...input,
      evaluationResult: llmShapedResult,
    });

    // (a) The reasoning sentence, every concern, the model name, and the scoring
    // mode all ride inside the canonical bytes the Ed25519 signature covers.
    // Strip everything attached AFTER signing (audit_hash, signatures,
    // timestamp_token) and recompute the canonical body.
    const { audit_hash, signatures, timestamp_token: _ts, ...body } = record;
    void _ts;
    const canonicalBody = canonicalize(body).toString('utf-8');
    expect(canonicalBody).toContain(REASONING);
    for (const concern of CONCERNS) expect(canonicalBody).toContain(concern);
    expect(canonicalBody).toContain(MODEL);
    expect(canonicalBody).toContain('llm_with_keyword_fallback');
    expect(canonicalBody).toContain('"scoring_path":"llm"');

    // (b) The Ed25519 signature verifies against the canonical body.
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

    // (c) audit_hash recomputes from body + signatures (verifies the hash binds
    // the signature itself, not just the unsigned body).
    expect(computeAuditHash({ ...body, signatures })).toBe(audit_hash);

    // (d) Tampering with the reasoning sentence flips the signature — the
    // binding invariant. The hermetic verifier (verify()) is given the
    // test-local public key directly; the production verifier
    // (lib/verify/verify-receipt.ts -> verifyReceipt) reads the PUBLISHED key
    // from disk, which the tmpdir-backed test key won't match. The Bubble 23
    // Phase 1 live capture exercised the production verifier end-to-end
    // (returned verified:true on a record carrying real LLM reasoning).
    const tamperedBody = JSON.parse(JSON.stringify(body)) as typeof body;
    const tamperedAmc = (tamperedBody.evaluation.composite_evaluations ?? []).find(
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

    // (e) Hash-chain link: a second record built on top carries the first's
    // audit_hash in previous_audit_hash and its own audit_hash recomputes.
    const followon = await buildInternalAuditRecord({
      ...input,
      evaluationResult: llmShapedResult,
      previousAuditHash: record.audit_hash,
    });
    expect(followon.previous_audit_hash).toBe(record.audit_hash);
    const { audit_hash: followonHash, ...followonRest } = followon;
    expect(computeAuditHash(followonRest)).toBe(followonHash);
  });
});
