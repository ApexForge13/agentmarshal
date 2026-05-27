// bd_query_purpose_matches composite predicate (Bubble 17).
//
// The second governance check a bd_permissions rule runs. Passes when the BD
// call's declared `purpose` parameter equals the purpose the matched rule
// declares (match.parameters.purpose.equals) — i.e. the agent isn't repurposing
// a narrowly-scoped grant. Runtime state rides ctx.action_properties, threaded
// by lib/mcp/govern.ts:
//
//   action_properties.bd_call          : { service, tool, parameters: { purpose } }
//   action_properties.bd_matched_rule  : the bd_permissions rule being evaluated
//
// Outcomes (fail-safe; isAllowable permits pass-only):
//   - bd_call.parameters.purpose or the rule's declared purpose absent → STUB
//   - actual === declared                                              → PASS
//   - otherwise                                                        → FAIL

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type BdQueryPurposeMatchesInput = Record<string, never>;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const PREDICATE_NAME = 'bd_query_purpose_matches';

/** Reads action_properties.bd_call.parameters.purpose; null if absent/malformed. */
function readCallPurpose(props: Record<string, unknown> | undefined): string | null {
  const call = props?.['bd_call'];
  if (typeof call !== 'object' || call === null) return null;
  const params = (call as Record<string, unknown>)['parameters'];
  if (typeof params !== 'object' || params === null) return null;
  const purpose = (params as Record<string, unknown>)['purpose'];
  return typeof purpose === 'string' && purpose.length > 0 ? purpose : null;
}

/** Reads bd_matched_rule.match.parameters.purpose.equals; null if absent/malformed. */
function readDeclaredPurpose(props: Record<string, unknown> | undefined): string | null {
  const rule = props?.['bd_matched_rule'];
  if (typeof rule !== 'object' || rule === null) return null;
  const match = (rule as Record<string, unknown>)['match'];
  const params =
    typeof match === 'object' && match !== null
      ? (match as Record<string, unknown>)['parameters']
      : undefined;
  const purpose =
    typeof params === 'object' && params !== null
      ? (params as Record<string, unknown>)['purpose']
      : undefined;
  const equals =
    typeof purpose === 'object' && purpose !== null
      ? (purpose as Record<string, unknown>)['equals']
      : undefined;
  return typeof equals === 'string' && equals.length > 0 ? equals : null;
}

export const bdQueryPurposeMatchesPredicate: CompositePredicate<BdQueryPurposeMatchesInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(_input, ctx): Promise<CompositePredicateEvaluation> {
    const actual = readCallPurpose(ctx.action_properties);
    const expected = readDeclaredPurpose(ctx.action_properties);

    if (actual === null || expected === null) {
      const missing: string[] = [];
      if (actual === null) missing.push('bd_call.parameters.purpose');
      if (expected === null) missing.push('bd_matched_rule.match.parameters.purpose.equals');
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: `bd_query_purpose_matches unresolved (missing: ${missing.join(', ')})`,
        details: {
          unresolved: true,
          missing,
          reasons: ['BD query purpose could not resolve: required runtime state absent'],
        },
      };
    }

    if (actual === expected) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `purpose ${actual} matches the declared purpose`,
        details: { purpose: actual, declared_purpose: expected },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: `purpose ${actual} does not match declared ${expected}`,
      details: {
        purpose: actual,
        declared_purpose: expected,
        reasons: ['BD call purpose does not match the purpose the matched bd_permissions rule declares'],
      },
    };
  },
};
