// Policy engine. Pure evaluation over a PolicyDocument loaded from YAML.
// loadPolicy() is the only disk-touching function.

import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';

import { MATCHERS, type Op } from '@/lib/policy-matchers';
import type {
  Action,
  Condition,
  EvaluateInput,
  PolicyDecision,
  PolicyDocument,
  PolicyRule,
  PolicyRuleHit,
} from '@/types';

// Re-export the engine-facing types so callers can `import { ... } from
// '@/lib/policy-engine'` without reaching into '@/types' directly.
export type {
  Condition,
  EvaluateInput,
  PolicyDocument,
  PolicyRule,
} from '@/types';

// Priority order for op-as-key shorthand. First key present wins.
const SHORTHAND_KEYS: Array<{ key: keyof Condition; op: Op }> = [
  { key: 'match', op: 'exact' },
  { key: 'contains', op: 'contains' },
  { key: 'regex', op: 'regex' },
  { key: 'not_matches', op: 'not_matches' },
  { key: 'less_than', op: 'less_than' },
  { key: 'greater_than', op: 'greater_than' },
  { key: 'threshold', op: 'threshold' },
  { key: 'boolean', op: 'boolean' },
];

interface NormalizedCondition {
  source: Condition['source'];
  field: string;
  op: Op;
  value: unknown;
}

function normalizeCondition(
  cond: Condition,
  ruleName: string,
  idx: number,
): NormalizedCondition {
  const present = SHORTHAND_KEYS.filter((s) => cond[s.key] !== undefined);

  if (present.length > 0 && cond.op !== undefined) {
    throw new Error(
      `Policy rule "${ruleName}" condition[${idx}] specifies both verbose 'op' and shorthand '${present[0].key}' — pick one.`,
    );
  }

  if (present.length > 0) {
    const { key, op } = present[0];
    return {
      source: cond.source,
      field: cond.field,
      op,
      value: cond[key],
    };
  }

  if (cond.op === undefined) {
    throw new Error(
      `Policy rule "${ruleName}" condition[${idx}] has no op or shorthand.`,
    );
  }

  return {
    source: cond.source,
    field: cond.field,
    op: cond.op,
    value: cond.value,
  };
}

function resolveField(
  cond: NormalizedCondition,
  input: EvaluateInput,
): unknown {
  if (cond.source === 'lobstertrap') {
    return (input.lobsterTrapMetadata as unknown as Record<string, unknown>)[
      cond.field
    ];
  }
  return input.agentmarshalContext?.[cond.field];
}

function buildDecision(
  action: Action,
  rulesFired: PolicyRuleHit[],
  input: EvaluateInput,
  metadata: Record<string, unknown> = {},
): PolicyDecision {
  return {
    action,
    rulesFired,
    declaredScope: input.declaredScope,
    declaredIntent: input.declaredIntent,
    detectedIntent: input.lobsterTrapMetadata.intent_category ?? '',
    timestamp: new Date().toISOString(),
    metadata,
  };
}

export function evaluate(
  policy: PolicyDocument,
  input: EvaluateInput,
): PolicyDecision {
  const rules = policy.policy_rules ?? [];
  const ordered = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of ordered) {
    if (!rule.conditions || rule.conditions.length === 0) continue;

    const normalized = rule.conditions.map((c, i) =>
      normalizeCondition(c, rule.name, i),
    );

    const allPass = normalized.every((cond) => {
      const matcher = MATCHERS[cond.op];
      if (!matcher) return false;
      const actual = resolveField(cond, input);
      return matcher(actual, cond.value);
    });

    if (allPass) {
      const flag = rule.flag ?? normalized[0].field;
      const hit: PolicyRuleHit = {
        name: rule.name,
        flag,
        description: rule.description ?? '',
      };
      const metadata: Record<string, unknown> = {};
      if (rule.escalate_to) metadata.escalate_to = rule.escalate_to;
      return buildDecision(rule.action, [hit], input, metadata);
    }
  }

  return buildDecision(policy.default_action ?? 'ALLOW', [], input);
}

export function loadPolicy(path: string): PolicyDocument {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(
      `loadPolicy: cannot read ${path}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(
      `loadPolicy: invalid YAML at ${path}: ${(err as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`loadPolicy: ${path} did not parse to an object`);
  }

  const doc = parsed as Record<string, unknown>;

  if (doc.version === undefined) {
    throw new Error(`loadPolicy: ${path} is missing required 'version' field`);
  }
  if (typeof doc.version !== 'string' && typeof doc.version !== 'number') {
    throw new Error(
      `loadPolicy: ${path} 'version' must be a string or number`,
    );
  }

  // Accept either `policy_rules` (canonical) or `rules` (legacy/short form).
  const rulesRaw = doc.policy_rules ?? doc.rules;
  if (!Array.isArray(rulesRaw)) {
    throw new Error(
      `loadPolicy: ${path} must have a 'policy_rules' or 'rules' array`,
    );
  }

  const normalized = { ...doc, policy_rules: rulesRaw } as PolicyDocument;
  return normalized;
}
