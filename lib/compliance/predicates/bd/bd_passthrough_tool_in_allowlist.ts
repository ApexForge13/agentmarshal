// bd_passthrough_tool_in_allowlist composite predicate (Bubble 20 Phase B).
//
// Governance check for the bd_mcp_passthrough rule: the agent may forward an MCP call
// to Bright Data's hosted MCP server only for a BD tool the matched rule allowlists.
// An explicit, audited parallel to the match-level `bd_tool_name.in` predicate in
// lib/mcp/govern.ts (same pattern as bd_domain_in_scope). Runtime state rides
// ctx.action_properties, threaded by lib/mcp/govern.ts:
//
//   action_properties.bd_call          : { service, tool, parameters: { bd_tool_name } }
//   action_properties.bd_matched_rule  : the bd_permissions rule being evaluated
//
// Outcomes (fail-safe; isAllowable permits pass-only):
//   - bd_call.parameters.bd_tool_name or the rule's allowlist absent → STUB
//   - bd_tool_name in the allowlist                                  → PASS
//   - otherwise                                                      → FAIL

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type BdPassthroughToolInAllowlistInput = Record<string, never>;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const PREDICATE_NAME = 'bd_passthrough_tool_in_allowlist';

/** Reads action_properties.bd_call.parameters.bd_tool_name; null if absent/malformed. */
function readToolName(props: Record<string, unknown> | undefined): string | null {
  const call = props?.['bd_call'];
  if (typeof call !== 'object' || call === null) return null;
  const params = (call as Record<string, unknown>)['parameters'];
  if (typeof params !== 'object' || params === null) return null;
  const name = (params as Record<string, unknown>)['bd_tool_name'];
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/** Reads bd_matched_rule.match.parameters.bd_tool_name.in; null if absent/malformed/empty. */
function readAllowlist(props: Record<string, unknown> | undefined): string[] | null {
  const rule = props?.['bd_matched_rule'];
  if (typeof rule !== 'object' || rule === null) return null;
  const match = (rule as Record<string, unknown>)['match'];
  const params =
    typeof match === 'object' && match !== null
      ? (match as Record<string, unknown>)['parameters']
      : undefined;
  const toolNamePred =
    typeof params === 'object' && params !== null
      ? (params as Record<string, unknown>)['bd_tool_name']
      : undefined;
  const inList =
    typeof toolNamePred === 'object' && toolNamePred !== null
      ? (toolNamePred as Record<string, unknown>)['in']
      : undefined;
  if (!Array.isArray(inList)) return null;
  const names = inList.filter((x): x is string => typeof x === 'string');
  return names.length > 0 ? names : null;
}

export const bdPassthroughToolInAllowlistPredicate: CompositePredicate<BdPassthroughToolInAllowlistInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(_input, ctx): Promise<CompositePredicateEvaluation> {
      const toolName = readToolName(ctx.action_properties);
      const allowlist = readAllowlist(ctx.action_properties);

      if (toolName === null || allowlist === null) {
        const missing: string[] = [];
        if (toolName === null) missing.push('bd_call.parameters.bd_tool_name');
        if (allowlist === null) missing.push('bd_matched_rule.match.parameters.bd_tool_name.in');
        return {
          predicate: PREDICATE_NAME,
          result: 'stub',
          reason: `bd_passthrough_tool_in_allowlist unresolved (missing: ${missing.join(', ')})`,
          details: {
            unresolved: true,
            missing,
            reasons: ['BD passthrough tool allowlist could not resolve: required runtime state absent'],
          },
        };
      }

      if (allowlist.includes(toolName)) {
        return {
          predicate: PREDICATE_NAME,
          result: 'pass',
          reason: `BD MCP tool ${toolName} is in the passthrough allowlist`,
          details: { bd_tool_name: toolName, allowlist },
        };
      }

      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `BD MCP tool ${toolName} is not in the passthrough allowlist`,
        details: {
          bd_tool_name: toolName,
          allowlist,
          reasons: ['Requested BD MCP tool is not declared in the matched rule bd_tool_name allowlist'],
        },
      };
    },
  };
