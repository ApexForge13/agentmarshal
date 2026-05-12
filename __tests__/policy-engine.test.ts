import { describe, it, expect } from 'vitest';
import path from 'node:path';

import {
  evaluate,
  loadPolicy,
  type PolicyDocument,
  type EvaluateInput,
} from '../lib/policy-engine';
import type { LobsterTrapMetadata } from '../types';

function cleanLTMetadata(
  overrides: Partial<LobsterTrapMetadata> = {},
): LobsterTrapMetadata {
  return {
    intent_category: 'unknown',
    intent_confidence: 0,
    risk_score: 0,
    contains_code: false,
    contains_credentials: false,
    contains_pii: false,
    contains_pii_request: false,
    contains_system_commands: false,
    contains_malware_request: false,
    contains_phishing_patterns: false,
    contains_role_impersonation: false,
    contains_exfiltration: false,
    contains_harm_patterns: false,
    contains_obfuscation: false,
    contains_injection_patterns: false,
    contains_file_paths: false,
    contains_sensitive_paths: false,
    contains_urls: false,
    target_paths: null,
    target_domains: null,
    target_commands: null,
    token_count: 0,
    ...overrides,
  };
}

const INJECTION_RULE: PolicyDocument['policy_rules'][number] = {
  name: 'block_prompt_injection',
  priority: 100,
  action: 'DENY',
  description: 'Stop injection-driven scope escapes.',
  conditions: [
    {
      source: 'lobstertrap',
      field: 'contains_injection_patterns',
      op: 'exact',
      value: true,
    },
    {
      source: 'lobstertrap',
      field: 'risk_score',
      op: 'greater_than',
      value: 0.7,
    },
  ],
};

const MARGIN_RULE: PolicyDocument['policy_rules'][number] = {
  name: 'quote_margin_below_floor',
  priority: 80,
  action: 'HUMAN_REVIEW',
  description: 'Escalate quotes below the configured margin floor.',
  conditions: [
    {
      source: 'agentmarshal',
      field: 'quote_margin',
      op: 'less_than',
      value: 0.35,
    },
  ],
  escalate_to: 'operator',
};

function baseInput(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    agentId: 'voice-scheduling',
    declaredScope: 'calendar.write',
    declaredIntent: 'Book a 30-minute appointment',
    attemptedAction: { tool: 'calendar.create', args: {} },
    lobsterTrapMetadata: cleanLTMetadata(),
    ...overrides,
  };
}

describe('evaluate — GREEN (normal scheduling)', () => {
  it('returns ALLOW with no rules fired when nothing matches', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [INJECTION_RULE, MARGIN_RULE],
    };
    const input = baseInput({
      lobsterTrapMetadata: cleanLTMetadata({
        intent_category: 'scheduling',
        intent_confidence: 0.95,
        risk_score: 0.05,
      }),
    });

    const decision = evaluate(policy, input);

    expect(decision.action).toBe('ALLOW');
    expect(decision.rulesFired).toEqual([]);
    expect(decision.declaredScope).toBe('calendar.write');
    expect(decision.declaredIntent).toBe('Book a 30-minute appointment');
    expect(decision.detectedIntent).toBe('scheduling');
    expect(decision.metadata).toEqual({});
    expect(typeof decision.timestamp).toBe('string');
  });
});

describe('evaluate — YELLOW (margin below floor)', () => {
  it('fires the agentmarshal-sourced margin rule and surfaces escalate_to', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [INJECTION_RULE, MARGIN_RULE],
    };
    const input = baseInput({
      agentId: 'quoting',
      declaredScope: 'quotes.create',
      declaredIntent: 'Send quote for new roof',
      lobsterTrapMetadata: cleanLTMetadata({
        intent_category: 'quoting',
        risk_score: 0.1,
      }),
      agentmarshalContext: {
        quote_margin: 0.28,
        quote_amount: 14800,
      },
    });

    const decision = evaluate(policy, input);

    expect(decision.action).toBe('HUMAN_REVIEW');
    expect(decision.rulesFired).toHaveLength(1);
    expect(decision.rulesFired[0].name).toBe('quote_margin_below_floor');
    expect(decision.metadata).toEqual({ escalate_to: 'operator' });
  });
});

describe('evaluate — RED (prompt injection)', () => {
  it('DENYs when both injection conditions hold', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [INJECTION_RULE, MARGIN_RULE],
    };
    const input = baseInput({
      agentId: 'comms',
      declaredScope: 'email.send',
      declaredIntent: 'Send vendor confirmation',
      lobsterTrapMetadata: cleanLTMetadata({
        intent_category: 'exfiltration',
        risk_score: 0.83,
        contains_injection_patterns: true,
        contains_obfuscation: true,
      }),
    });

    const decision = evaluate(policy, input);

    expect(decision.action).toBe('DENY');
    expect(decision.rulesFired).toHaveLength(1);
    expect(decision.rulesFired[0].name).toBe('block_prompt_injection');
    expect(decision.detectedIntent).toBe('exfiltration');
  });

  it('does not fire if only one of the AND conditions holds', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [INJECTION_RULE],
    };
    const input = baseInput({
      agentId: 'comms',
      lobsterTrapMetadata: cleanLTMetadata({
        risk_score: 0.4,
        contains_injection_patterns: true,
      }),
    });

    const decision = evaluate(policy, input);

    expect(decision.action).toBe('ALLOW');
    expect(decision.rulesFired).toEqual([]);
  });
});

describe('evaluate — priority ordering', () => {
  it('higher priority wins when multiple rules match; only that one is recorded', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [
        {
          name: 'low_pri_catchall',
          priority: 10,
          action: 'HUMAN_REVIEW',
          conditions: [
            {
              source: 'lobstertrap',
              field: 'contains_injection_patterns',
              op: 'exact',
              value: true,
            },
          ],
        },
        {
          name: 'high_pri_block',
          priority: 999,
          action: 'DENY',
          conditions: [
            {
              source: 'lobstertrap',
              field: 'contains_injection_patterns',
              op: 'exact',
              value: true,
            },
          ],
        },
      ],
    };
    const input = baseInput({
      agentId: 'comms',
      lobsterTrapMetadata: cleanLTMetadata({
        risk_score: 0.9,
        contains_injection_patterns: true,
      }),
    });

    const decision = evaluate(policy, input);

    expect(decision.action).toBe('DENY');
    expect(decision.rulesFired).toHaveLength(1);
    expect(decision.rulesFired[0].name).toBe('high_pri_block');
  });
});

describe('evaluate — op-as-key shorthand', () => {
  it('parses `match` (exact) and `less_than` shorthands equivalently to verbose form', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [
        {
          name: 'shorthand_margin',
          priority: 50,
          action: 'HUMAN_REVIEW',
          conditions: [
            { source: 'agentmarshal', field: 'tool_call', match: 'send_quote' },
            { source: 'agentmarshal', field: 'quote_margin', less_than: 0.35 },
          ],
          flag: 'below_margin_floor',
        },
      ],
    };
    const input = baseInput({
      agentId: 'quoting',
      agentmarshalContext: { tool_call: 'send_quote', quote_margin: 0.28 },
    });

    const decision = evaluate(policy, input);

    expect(decision.action).toBe('HUMAN_REVIEW');
    expect(decision.rulesFired).toHaveLength(1);
    expect(decision.rulesFired[0].name).toBe('shorthand_margin');
    expect(decision.rulesFired[0].flag).toBe('below_margin_floor');
  });

  it('throws if a condition has both verbose op and shorthand', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [
        {
          name: 'bad_rule',
          priority: 10,
          action: 'DENY',
          conditions: [
            {
              source: 'agentmarshal',
              field: 'tool_call',
              op: 'exact',
              value: 'x',
              match: 'x',
            },
          ],
        },
      ],
    };
    expect(() => evaluate(policy, baseInput())).toThrow(/bad_rule/);
  });
});

describe('evaluate — default_action', () => {
  it('returns the policy default when no rule fires', () => {
    const policy: PolicyDocument = {
      version: 1,
      default_action: 'DENY',
      policy_rules: [INJECTION_RULE],
    };
    const decision = evaluate(policy, baseInput());

    expect(decision.action).toBe('DENY');
    expect(decision.rulesFired).toEqual([]);
  });

  it('falls back to ALLOW when default_action is omitted and no rule fires', () => {
    const policy: PolicyDocument = {
      version: 1,
      policy_rules: [INJECTION_RULE],
    };
    expect(evaluate(policy, baseInput()).action).toBe('ALLOW');
  });
});

describe('loadPolicy — YAML loading', () => {
  it('parses configs/policy.yaml and surfaces top-level fields', () => {
    const policyPath = path.resolve(process.cwd(), 'configs', 'policy.yaml');
    const doc = loadPolicy(policyPath);

    expect(doc.version).toBe('1.0');
    expect(doc.operator).toBe('mike-cortez');
    expect(doc.agents).toBeDefined();
    expect(doc.agents).toHaveLength(5);
    expect(doc.vendors?.approved).toHaveLength(3);
    expect(doc.policy_rules.length).toBeGreaterThanOrEqual(6);
    expect(doc.default_action).toBe('ALLOW');
  });

  it('shorthand rules loaded from YAML fire the same as the verbose form', () => {
    const policyPath = path.resolve(process.cwd(), 'configs', 'policy.yaml');
    const doc = loadPolicy(policyPath);

    // Trigger block_vendor_payment_change via shorthand `match` conditions
    const decision = evaluate(
      doc,
      baseInput({
        agentId: 'comms',
        agentmarshalContext: {
          tool_call: 'update_vendor_payment_record',
          out_of_band_verification: false,
        },
      }),
    );

    expect(decision.action).toBe('DENY');
    expect(decision.rulesFired[0].name).toBe('block_vendor_payment_change');
    expect(decision.rulesFired[0].flag).toBe('payment_method_change_unverified');
  });
});
