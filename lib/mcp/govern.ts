// MCP-proxy governance core (Bubble 17).
//
// governMCPCall is the decision point the MCP proxy consults before forwarding a
// Bright Data tool call. It resolves the agent's Scope Contract, walks its
// bd_permissions rules (first matching+passing rule wins, mirroring declared_scope),
// and for a matching rule runs the rule's composite_checks through the standard
// composite dispatch registry — threading the {service, tool, parameters} call
// shape, the contract's bd_permissions, and the matched rule into action_properties
// so the BD composites can read them.
//
// Outcomes:
//   - first rule whose match holds AND whose composites all pass → permit
//   - a rule matched but a composite failed (and nothing else passed) → deny w/ reason
//   - no rule matched → deny "no_matching_rule"
// Deny is fail-closed; a signed receipt of the denial is still emitted upstream.

import { randomUUID } from 'crypto';
import { loadContractForAgent } from '@/lib/authzen/contracts';
import {
  getComposite,
  type CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';
import type {
  BDService,
  BDPermissionRule,
  BDPermissionMatch,
  BDParameterPredicate,
} from '@/types/authzen';
// Side-effect: ensure the BD governance composites are registered even if this
// module is reached outside the evaluation route's import graph.
import '@/lib/compliance/predicates/bd';

export interface BdCallShape {
  service: BDService;
  tool: string;
  parameters: Record<string, unknown>;
}

export interface GovernMCPCallParams extends BdCallShape {
  agent_id: string;
  /** subject.type, used for the agent-contract-map type-name fallback. */
  subject_type?: string;
}

export interface GovernMCPCallResult {
  permit: boolean;
  matched_rule_id: string | null;
  reason: string | null;
  composite_outcomes: CompositePredicateEvaluation[];
}

/** Equality that handles primitives (===) and simple structured literals (JSON). */
function literalEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Matches a URL's hostname against a domain pattern ('*.reuters.com' or 'reuters.com'). */
function hostnameMatchesPattern(hostname: string, pattern: string): boolean {
  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  return h === p;
}

/** Evaluates one BD parameter predicate against a call parameter value (operators AND). */
function evaluateParamPredicate(pred: BDParameterPredicate, value: unknown): boolean {
  if ('equals' in pred && !literalEquals(value, pred.equals)) return false;
  if ('in' in pred) {
    if (!Array.isArray(pred.in) || !pred.in.some((x) => literalEquals(x, value))) return false;
  }
  if ('exists' in pred) {
    const present = value !== undefined && value !== null;
    if (pred.exists === true && !present) return false;
    if (pred.exists === false && present) return false;
  }
  if ('matches' in pred && pred.matches !== undefined) {
    if (typeof value !== 'string' || !new RegExp(pred.matches).test(value)) return false;
  }
  if ('domain_in' in pred && pred.domain_in !== undefined) {
    if (typeof value !== 'string') return false;
    let hostname: string;
    try {
      hostname = new URL(value).hostname;
    } catch {
      return false;
    }
    if (!pred.domain_in.some((p) => hostnameMatchesPattern(hostname, p))) return false;
  }
  return true;
}

/** True iff the rule's match predicate holds for this BD call. */
export function matchBdRule(match: BDPermissionMatch, call: BdCallShape): boolean {
  if (match.service !== call.service) return false;
  if (match.tool !== undefined && match.tool !== call.tool) return false;
  if (match.parameters) {
    for (const [key, pred] of Object.entries(match.parameters)) {
      if (!evaluateParamPredicate(pred, call.parameters[key])) return false;
    }
  }
  return true;
}

/** Runs a matched rule's composite_checks through the dispatch registry. */
async function runRuleComposites(
  rule: BDPermissionRule,
  agentId: string,
  tenantId: string,
  bdPermissions: BDPermissionRule[],
  call: BdCallShape,
): Promise<CompositePredicateEvaluation[]> {
  const ctx: EvalContext = {
    now: new Date(),
    tenant_id: tenantId,
    agent_id: agentId,
    request_id: randomUUID(),
    audit: NULL_EMITTER,
    action_properties: {
      bd_call: { service: call.service, tool: call.tool, parameters: call.parameters },
      bd_permissions: bdPermissions,
      bd_matched_rule: rule,
    },
  };

  const outcomes: CompositePredicateEvaluation[] = [];
  for (const name of rule.composite_checks ?? []) {
    const composite = getComposite(name);
    if (!composite) {
      // Fail-closed: a rule naming an unregistered composite cannot be trusted.
      outcomes.push({
        predicate: name,
        result: 'fail',
        reason: `unknown composite: ${name}`,
        details: { unknown_composite: name },
      });
      continue;
    }
    outcomes.push(await composite.evaluate({}, ctx));
  }
  return outcomes;
}

export async function governMCPCall(params: GovernMCPCallParams): Promise<GovernMCPCallResult> {
  const contract = await loadContractForAgent(params.agent_id, params.subject_type);
  const rules = contract.bd_permissions ?? [];
  const tenantId = contract.tenant_id ?? 'default';
  const call: BdCallShape = {
    service: params.service,
    tool: params.tool,
    parameters: params.parameters,
  };

  let firstCompositeFailure: {
    rule_id: string;
    reason: string;
    outcomes: CompositePredicateEvaluation[];
  } | null = null;

  for (const rule of rules) {
    if (!matchBdRule(rule.match, call)) continue;

    const outcomes = await runRuleComposites(rule, params.agent_id, tenantId, rules, call);
    if (outcomes.every((o) => o.result === 'pass')) {
      return { permit: true, matched_rule_id: rule.rule_id, reason: null, composite_outcomes: outcomes };
    }
    if (firstCompositeFailure === null) {
      const bad = outcomes.find((o) => o.result !== 'pass');
      firstCompositeFailure = {
        rule_id: rule.rule_id,
        reason: bad?.reason ?? 'composite check did not pass',
        outcomes,
      };
    }
    // Continue: a later rule might match and pass.
  }

  if (firstCompositeFailure !== null) {
    return {
      permit: false,
      matched_rule_id: firstCompositeFailure.rule_id,
      reason: firstCompositeFailure.reason,
      composite_outcomes: firstCompositeFailure.outcomes,
    };
  }

  return { permit: false, matched_rule_id: null, reason: 'no_matching_rule', composite_outcomes: [] };
}
