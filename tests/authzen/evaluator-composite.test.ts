// Integration tests for composite-aware evaluator (Bubble 1a step 4).
// Covers the smoke case of an unknown composite name + happy + fail-safe paths.

import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateRequest, toAuthZenResponse } from '../../lib/authzen/evaluate';
import {
  clearComposites,
  registerComposite,
  type CompositePredicate,
  type CompositeResult,
} from '../../lib/authzen/composite-dispatch';
import { quietHoursPredicate } from '../../lib/compliance/predicates/tcpa/quiet-hours';
import { dncRegistryPredicate } from '../../lib/compliance/predicates/tcpa/dnc-registry';
import type { AuthZenRequest, ScopeContract } from '../../types/authzen';

const baseRequest: AuthZenRequest = {
  subject: { type: 'agent', id: 'agent-001' },
  action: { name: 'place_call' },
  resource: { type: 'lead', id: 'lead-1' },
};

function makeContract(overrides: Partial<ScopeContract> = {}): ScopeContract {
  return {
    scope_contract_version: '0.1',
    contract_id: 'composite-test',
    agent_id: 'agent-001',
    issuer: { type: 'system', id: 'test' },
    issued_at: '2026-05-21T00:00:00Z',
    declared_scope: [],
    ...overrides,
  };
}

describe('evaluator + composite dispatch integration', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('surfaces a clear error when a rule references an unknown composite name', async () => {
    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'rule-with-unknown-composite',
          match: { subject: { id: { exists: true } } },
          composite_checks: [{ predicate: 'tcpa_nonexistent_check', input: {} }],
          decision: { effect: 'allow', reason_code: 'OK', reason: '' },
        },
      ],
    });

    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T14:00:00Z'),
    });

    expect(result.effect).toBe('deny');
    expect(result.evaluation_path).toBe('no_match');
    expect(result.composite_evaluations).toBeDefined();
    const compEvals = result.composite_evaluations ?? [];
    expect(compEvals.length).toBe(1);
    expect(compEvals[0].predicate).toBe('tcpa_nonexistent_check');
    expect(compEvals[0].result).toBe('fail');
    expect(compEvals[0].reason).toMatch(/unknown composite predicate/i);
  });

  it('passing composite predicate allows a rule whose standard predicates also pass', async () => {
    registerComposite(quietHoursPredicate);

    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-with-quiet-hours-check',
          match: { action: { name: { equals: 'place_call' } } },
          composite_checks: [
            {
              predicate: 'tcpa_quiet_hours_respected',
              input: { recipient_timezone: 'America/New_York' },
            },
          ],
          decision: { effect: 'allow', reason_code: 'QUIET_HOURS_OK', reason: 'within window' },
        },
      ],
    });

    // 2026-05-21 15:00 UTC = 11:00 EDT (well inside window)
    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T15:00:00Z'),
    });

    expect(result.effect).toBe('allow');
    expect(result.matched_rule_id).toBe('allow-with-quiet-hours-check');
    expect(result.composite_evaluations?.[0].result).toBe('pass');
    expect(result.composite_evaluations?.[0].predicate).toBe('tcpa_quiet_hours_respected');
  });

  it('stub composite result blocks allow (fail-safe), evaluator falls through to next rule', async () => {
    registerComposite(dncRegistryPredicate);

    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-with-dnc-stub',
          match: { action: { name: { equals: 'place_call' } } },
          composite_checks: [
            { predicate: 'tcpa_dnc_registry_clear', input: { recipient_phone: '+14045551234' } },
          ],
          decision: { effect: 'allow', reason_code: 'WOULD_ALLOW', reason: '' },
        },
        {
          rule_id: 'fallback-deny',
          match: { subject: { id: { exists: true } } },
          decision: { effect: 'deny', reason_code: 'FAIL_SAFE_FALLBACK', reason: 'composite blocked' },
        },
      ],
    });

    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T15:00:00Z'),
    });

    expect(result.effect).toBe('deny');
    expect(result.matched_rule_id).toBe('fallback-deny');
    expect(result.composite_evaluations?.length).toBe(1);
    expect(result.composite_evaluations?.[0].result).toBe('stub');
  });

  it('failing composite input (Ajv) surfaces composite input invalid error', async () => {
    registerComposite(quietHoursPredicate);

    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'bad-input',
          match: { subject: { id: { exists: true } } },
          composite_checks: [
            // Missing required recipient_timezone
            { predicate: 'tcpa_quiet_hours_respected', input: { recipient_state: 'GA' } },
          ],
          decision: { effect: 'allow', reason_code: 'X', reason: '' },
        },
      ],
    });

    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T15:00:00Z'),
    });

    expect(result.effect).toBe('deny');
    expect(result.composite_evaluations?.[0].result).toBe('fail');
    expect(result.composite_evaluations?.[0].reason).toMatch(/composite input invalid/i);
  });
});

// Self-contained composites that always return a fixed result — isolate the
// three-state precedence logic from any real predicate's internals.
function fixedComposite(name: string, result: CompositeResult): CompositePredicate {
  return {
    name,
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: true,
    },
    async evaluate() {
      return { predicate: name, result, reason: `${name} → ${result}`, details: {} };
    },
  };
}

describe('three-state review_required precedence (Bubble 16)', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('a review composite blocks allow and sets review_required (decision stays false)', async () => {
    registerComposite(fixedComposite('always_review', 'review'));
    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-if-review-clears',
          match: { subject: { id: { exists: true } } },
          composite_checks: [{ predicate: 'always_review', input: {} }],
          decision: { effect: 'allow', reason_code: 'WOULD_ALLOW', reason: '' },
        },
      ],
    });

    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T15:00:00Z'),
    });

    // review blocks the allow → falls through to the implicit no_match deny.
    expect(result.effect).toBe('deny');
    expect(result.review_required).toBe(true);
    expect(result.review_reason).toBe('always_review → review');

    // AuthZEN boundary: decision is a strict boolean; review rides as a sibling.
    const response = toAuthZenResponse(result);
    expect(response.decision).toBe(false);
    expect(response.review_required).toBe(true);
    expect(response.review_reason).toBe('always_review → review');
  });

  it('a hard fail trumps a review in the same rule (review_required stays false)', async () => {
    registerComposite(fixedComposite('always_fail', 'fail'));
    registerComposite(fixedComposite('always_review', 'review'));
    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-if-both-clear',
          match: { subject: { id: { exists: true } } },
          composite_checks: [
            { predicate: 'always_fail', input: {} },
            { predicate: 'always_review', input: {} },
          ],
          decision: { effect: 'allow', reason_code: 'WOULD_ALLOW', reason: '' },
        },
      ],
    });

    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T15:00:00Z'),
    });

    expect(result.effect).toBe('deny');
    expect(result.review_required).toBeFalsy();
    expect(toAuthZenResponse(result).review_required).toBeUndefined();
  });

  it('a pure permit carries no review fields', async () => {
    registerComposite(fixedComposite('always_pass', 'pass'));
    const contract = makeContract({
      declared_scope: [
        {
          rule_id: 'allow-clean',
          match: { subject: { id: { exists: true } } },
          composite_checks: [{ predicate: 'always_pass', input: {} }],
          decision: { effect: 'allow', reason_code: 'OK', reason: '' },
        },
      ],
    });

    const result = await evaluateRequest(baseRequest, contract, {
      now: new Date('2026-05-21T15:00:00Z'),
    });

    expect(result.effect).toBe('allow');
    expect(result.review_required).toBeUndefined();
    const response = toAuthZenResponse(result);
    expect(response.decision).toBe(true);
    expect(response.review_required).toBeUndefined();
  });
});
