import { describe, it, expect } from 'vitest';
import { evaluateRequest, toAuthZenResponse } from '../lib/authzen/evaluate';
import type { AuthZenRequest, ScopeContract } from '../types/authzen';

const baseRequest: AuthZenRequest = {
  subject: { type: 'agent', id: 'agent-001' },
  action: { name: 'send_email' },
  resource: { type: 'lead', id: 'lead-1' },
  context: { recipient_state: 'GA' },
};

function makeContract(overrides: Partial<ScopeContract> = {}): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'test-contract',
    agent_id: 'agent-001',
    issuer: { type: 'system', id: 'test' },
    issued_at: '2026-05-21T00:00:00Z',
    declared_scope: [
      {
        rule_id: 'default-allow',
        match: { subject: { id: { exists: true } } },
        decision: { effect: 'allow', reason_code: 'TEST_ALLOW', reason: 'default test rule' },
      },
    ],
    ...overrides,
  };
}

describe('evaluateRequest — Phase 1: temporal', () => {
  it('denies when current time is before contract not_before', async () => {
    const c = makeContract({ not_before: '2030-01-01T00:00:00Z' });
    const result = await evaluateRequest(baseRequest, c, { now: new Date('2026-05-21T12:00:00Z') });
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('temporal');
    expect(result.reason_code).toBe('CONTRACT_NOT_YET_VALID');
  });

  it('denies when current time is at or after contract expires_at', async () => {
    const c = makeContract({ expires_at: '2026-01-01T00:00:00Z' });
    const result = await evaluateRequest(baseRequest, c, { now: new Date('2026-05-21T12:00:00Z') });
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('temporal');
    expect(result.reason_code).toBe('CONTRACT_EXPIRED');
  });

  it('proceeds past temporal when within validity window', async () => {
    const c = makeContract({
      not_before: '2026-05-01T00:00:00Z',
      expires_at: '2026-06-01T00:00:00Z',
    });
    const result = await evaluateRequest(baseRequest, c, { now: new Date('2026-05-21T12:00:00Z') });
    expect(result.effect).toBe('allow');
    expect(result.evaluation_path).toBe('declared_scope');
  });
});

describe('evaluateRequest — Phase 2: out_of_scope hard-deny', () => {
  it('denies when action.name matches unqualified string term', async () => {
    const c = makeContract({ out_of_scope: ['send_email'] });
    const result = await evaluateRequest(baseRequest, c);
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('out_of_scope');
    expect(result.reason_code).toBe('OUT_OF_SCOPE_HARD_DENY');
    expect(result.out_of_scope_term).toBe('send_email');
  });

  it('denies when action.properties.capability_category matches unqualified string', async () => {
    const req: AuthZenRequest = {
      ...baseRequest,
      action: { name: 'unknown_action', properties: { capability_category: 'payment' } },
    };
    const c = makeContract({ out_of_scope: ['payment'] });
    const result = await evaluateRequest(req, c);
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('out_of_scope');
  });

  it('denies via qualified object term { action: X }', async () => {
    const c = makeContract({ out_of_scope: [{ action: 'send_email' }] });
    const result = await evaluateRequest(baseRequest, c);
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('out_of_scope');
  });

  it('does not deny when no out_of_scope term matches', async () => {
    const c = makeContract({ out_of_scope: ['place_voice_call', 'authorize_payment'] });
    const result = await evaluateRequest(baseRequest, c);
    expect(result.effect).toBe('allow');
  });

  it('out_of_scope takes precedence over a matching declared_scope rule', async () => {
    const c = makeContract({
      out_of_scope: ['send_email'],
      declared_scope: [
        {
          rule_id: 'permissive',
          match: { subject: { id: { exists: true } } },
          decision: { effect: 'allow', reason_code: 'OK', reason: '' },
        },
      ],
    });
    const result = await evaluateRequest(baseRequest, c);
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('out_of_scope');
  });
});

describe('evaluateRequest — Phase 3: declared_scope first-match-wins', () => {
  it('matches first rule whose predicates all pass', async () => {
    const c = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-send-email-ga',
          match: {
            action: { name: { equals: 'send_email' } },
            context: { properties: { recipient_state: { in: ['GA', 'NC'] } } },
          },
          decision: { effect: 'allow', reason_code: 'TCPA_OK_GA', reason: 'GA recipient permitted' },
        },
      ],
    });
    const req: AuthZenRequest = {
      ...baseRequest,
      context: { properties: { recipient_state: 'GA' } },
    };
    const result = await evaluateRequest(req, c);
    expect(result.effect).toBe('allow');
    expect(result.matched_rule_id).toBe('allow-send-email-ga');
    expect(result.reason_code).toBe('TCPA_OK_GA');
  });

  it('skips rule when any predicate fails, evaluates next', async () => {
    const c = makeContract({
      declared_scope: [
        {
          rule_id: 'deny-fl',
          match: { context: { properties: { recipient_state: { equals: 'FL' } } } },
          decision: { effect: 'deny', reason_code: 'STATE_BLOCKED', reason: 'FL excluded' },
        },
        {
          rule_id: 'allow-other',
          match: { subject: { id: { exists: true } } },
          decision: { effect: 'allow', reason_code: 'FALLBACK_OK', reason: 'fallback' },
        },
      ],
    });
    const req: AuthZenRequest = {
      ...baseRequest,
      context: { properties: { recipient_state: 'GA' } },
    };
    const result = await evaluateRequest(req, c);
    expect(result.effect).toBe('allow');
    expect(result.matched_rule_id).toBe('allow-other');
  });

  it('returns escalate effect with escalation_required in AuthZEN response context', async () => {
    const c = makeContract({
      declared_scope: [
        {
          rule_id: 'escalate-large-amount',
          match: { action: { properties: { amount: { currency: 'USD', min: 10000 } } } },
          decision: {
            effect: 'escalate',
            escalation_target: 'ops_team',
            reason_code: 'AMOUNT_EXCEEDS_THRESHOLD',
            reason: 'Amount over $10K requires human review',
          },
        },
      ],
      escalation: {
        targets: { ops_team: { method: 'email', address: 'ops@example.com' } },
      },
    });
    const req: AuthZenRequest = {
      ...baseRequest,
      action: { name: 'authorize_payment', properties: { amount: { amount: 15000, currency: 'USD' } } },
    };
    const result = await evaluateRequest(req, c);
    expect(result.effect).toBe('escalate');
    expect(result.reason_code).toBe('AMOUNT_EXCEEDS_THRESHOLD');

    const response = toAuthZenResponse(result);
    expect(response.decision).toBe(false);
    expect(response.context?.escalation_required).toBe(true);
  });

  it('captures predicate trace for matched rule', async () => {
    const c = makeContract({
      declared_scope: [
        {
          rule_id: 'multi-predicate',
          match: {
            action: { name: { equals: 'send_email' } },
            context: { properties: { recipient_state: { in: ['GA', 'NC'] } } },
          },
          decision: { effect: 'allow', reason_code: 'OK', reason: '' },
        },
      ],
    });
    const req: AuthZenRequest = {
      ...baseRequest,
      context: { properties: { recipient_state: 'GA' } },
    };
    const result = await evaluateRequest(req, c);
    expect(result.predicate_evaluations.length).toBeGreaterThan(0);
    const paths = result.predicate_evaluations.map(e => e.predicate_path);
    expect(paths).toContain('action.name');
    expect(paths).toContain('context.properties.recipient_state');
    expect(result.predicate_evaluations.every(e => e.result === 'pass')).toBe(true);
  });
});

describe('evaluateRequest — Phase 4: no_match implicit deny', () => {
  it('denies when no rule matches', async () => {
    const c = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-only-place-call',
          match: { action: { name: { equals: 'place_call' } } },
          decision: { effect: 'allow', reason_code: 'CALL_OK', reason: 'calls allowed' },
        },
      ],
    });
    const result = await evaluateRequest(baseRequest, c);
    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('no_match');
    expect(result.reason_code).toBe('NO_MATCH_IMPLICIT_DENY');
    expect(result.matched_rule_id).toBe(null);
  });
});

describe('toAuthZenResponse — mapping invariants', () => {
  it('allow effect → decision:true', () => {
    const r = toAuthZenResponse({
      effect: 'allow', evaluation_path: 'declared_scope', matched_rule_id: 'r1',
      out_of_scope_term: null, reason_code: 'OK', reason: '', predicate_evaluations: [],
    });
    expect(r.decision).toBe(true);
  });

  it('deny effect → decision:false', () => {
    const r = toAuthZenResponse({
      effect: 'deny', evaluation_path: 'no_match', matched_rule_id: null,
      out_of_scope_term: null, reason_code: 'NO_MATCH_IMPLICIT_DENY', reason: '', predicate_evaluations: [],
    });
    expect(r.decision).toBe(false);
    expect(r.context?.escalation_required).toBeUndefined();
  });

  it('escalate effect → decision:false + escalation_required:true', () => {
    const r = toAuthZenResponse({
      effect: 'escalate', evaluation_path: 'declared_scope', matched_rule_id: 'r1',
      out_of_scope_term: null, reason_code: 'ESCALATED', reason: '', predicate_evaluations: [],
    });
    expect(r.decision).toBe(false);
    expect(r.context?.escalation_required).toBe(true);
  });
});
