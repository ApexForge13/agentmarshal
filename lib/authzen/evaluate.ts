// Full Scope Contract evaluation.
// Phases: temporal → out_of_scope → declared_scope (first-match-wins) → no_match.

import { evaluatePredicate } from './predicates';
import type {
  AuthZenRequest,
  AuthZenResponse,
  EvaluationResult,
  PredicateEvaluation,
  PredicateContext,
  ScopeContract,
  ScopeRule,
  EntityPredicate,
  OutOfScopeEntry,
  ScopeContractEffect,
} from '@/types/authzen';

export interface EvaluateOptions {
  /** Override "now" for deterministic tests. Default: new Date(). */
  now?: Date;
}

export async function evaluateRequest(
  request: AuthZenRequest,
  contract: ScopeContract,
  options: EvaluateOptions = {}
): Promise<EvaluationResult> {
  const now = options.now ?? new Date();
  const predicateContext: PredicateContext = { now };

  // Phase 1: Temporal
  if (contract.not_before) {
    const nb = new Date(contract.not_before);
    if (!isNaN(nb.getTime()) && now < nb) {
      return temporalDeny('CONTRACT_NOT_YET_VALID', `Contract not_before is ${contract.not_before}`);
    }
  }
  if (contract.expires_at) {
    const exp = new Date(contract.expires_at);
    if (!isNaN(exp.getTime()) && now >= exp) {
      return temporalDeny('CONTRACT_EXPIRED', `Contract expired at ${contract.expires_at}`);
    }
  }

  // Phase 2: out_of_scope hard-deny
  if (contract.out_of_scope && contract.out_of_scope.length > 0) {
    for (const term of contract.out_of_scope) {
      if (matchesOutOfScopeTerm(term, request)) {
        return outOfScopeDeny(term);
      }
    }
  }

  // Phase 3: declared_scope first-match-wins
  const allEvaluations: PredicateEvaluation[] = [];
  for (const rule of contract.declared_scope) {
    const ruleEvals: PredicateEvaluation[] = [];
    const matched = ruleMatches(rule, request, predicateContext, ruleEvals);
    allEvaluations.push(...ruleEvals);
    if (matched) {
      return {
        effect: rule.decision.effect,
        evaluation_path: 'declared_scope',
        matched_rule_id: rule.rule_id,
        out_of_scope_term: null,
        reason_code: rule.decision.reason_code || synthReasonCode(rule.decision.effect),
        reason: rule.decision.reason || '',
        predicate_evaluations: allEvaluations,
      };
    }
  }

  // Phase 4: no_match implicit deny
  return {
    effect: 'deny',
    evaluation_path: 'no_match',
    matched_rule_id: null,
    out_of_scope_term: null,
    reason_code: 'NO_MATCH_IMPLICIT_DENY',
    reason: 'No declared_scope rule matched; implicit deny per Scope Contract semantics.',
    predicate_evaluations: allEvaluations,
  };
}

function temporalDeny(reason_code: string, reason: string): EvaluationResult {
  return {
    effect: 'deny',
    evaluation_path: 'temporal',
    matched_rule_id: null,
    out_of_scope_term: null,
    reason_code,
    reason,
    predicate_evaluations: [],
  };
}

function outOfScopeDeny(term: OutOfScopeEntry): EvaluationResult {
  return {
    effect: 'deny',
    evaluation_path: 'out_of_scope',
    matched_rule_id: null,
    out_of_scope_term: term,
    reason_code: 'OUT_OF_SCOPE_HARD_DENY',
    reason: `Action matched out_of_scope term: ${JSON.stringify(term)}`,
    predicate_evaluations: [],
  };
}

function synthReasonCode(effect: ScopeContractEffect): string {
  switch (effect) {
    case 'allow': return 'ALLOWED_BY_RULE';
    case 'deny': return 'DENIED_BY_RULE';
    case 'escalate': return 'ESCALATED_BY_RULE';
  }
}

function matchesOutOfScopeTerm(term: OutOfScopeEntry, request: AuthZenRequest): boolean {
  if (typeof term === 'string') {
    if (request.action.name === term) return true;
    const cap = request.action.properties?.['capability_category'];
    if (cap === term) return true;
    return false;
  }
  if (typeof term === 'object' && term !== null) {
    if ('action' in term && typeof term.action === 'string') {
      return request.action.name === term.action;
    }
    if ('capability_category' in term && typeof term.capability_category === 'string') {
      return request.action.properties?.['capability_category'] === term.capability_category;
    }
  }
  return false;
}

function ruleMatches(
  rule: ScopeRule,
  request: AuthZenRequest,
  predicateContext: PredicateContext,
  evals: PredicateEvaluation[]
): boolean {
  const blocks = [
    { name: 'subject', predicates: rule.match.subject, actual: request.subject as unknown },
    { name: 'action', predicates: rule.match.action, actual: request.action as unknown },
    { name: 'resource', predicates: rule.match.resource, actual: request.resource as unknown },
    { name: 'context', predicates: rule.match.context, actual: (request.context ?? {}) as unknown },
  ];

  for (const block of blocks) {
    if (!block.predicates) continue;
    const passed = entityMatches(block.name, block.predicates, block.actual, predicateContext, rule.rule_id, evals);
    if (!passed) return false;
  }
  return true;
}

function entityMatches(
  blockName: string,
  predicates: EntityPredicate,
  actualEntity: unknown,
  predicateContext: PredicateContext,
  ruleId: string,
  evals: PredicateEvaluation[]
): boolean {
  const entity = (actualEntity ?? {}) as Record<string, unknown>;

  // Top-level entity field predicates
  for (const field of ['type', 'id', 'name', 'capability_category', 'vendor_ref'] as const) {
    const constraint = predicates[field];
    if (constraint === undefined) continue;
    const actual = entity[field];
    const outcome = evaluatePredicate(constraint, actual, predicateContext);
    evals.push({
      rule_id: ruleId,
      predicate_path: `${blockName}.${field}`,
      constraint,
      actual_value: actual,
      result: outcome.result,
      reason: outcome.reason,
    });
    if (outcome.result === 'fail') return false;
  }

  // Nested properties
  if (predicates.properties) {
    const actualProps = (entity['properties'] ?? {}) as Record<string, unknown>;
    for (const [propKey, propConstraint] of Object.entries(predicates.properties)) {
      const actualPropValue = actualProps[propKey];
      const outcome = evaluatePredicate(propConstraint, actualPropValue, predicateContext);
      evals.push({
        rule_id: ruleId,
        predicate_path: `${blockName}.properties.${propKey}`,
        constraint: propConstraint,
        actual_value: actualPropValue,
        result: outcome.result,
        reason: outcome.reason,
      });
      if (outcome.result === 'fail') return false;
    }
  }
  return true;
}

/**
 * Map Scope Contract evaluation to AuthZEN response.
 * allow → decision:true; deny → false; escalate → false (with escalation_required in context).
 */
export function toAuthZenResponse(result: EvaluationResult): AuthZenResponse {
  const baseContext: Record<string, unknown> = {
    reason_code: result.reason_code,
    reason: result.reason,
    matched_rule_id: result.matched_rule_id,
    evaluation_path: result.evaluation_path,
  };

  if (result.effect === 'allow') {
    return { decision: true, context: baseContext };
  }
  if (result.effect === 'escalate') {
    return { decision: false, context: { ...baseContext, escalation_required: true } };
  }
  return { decision: false, context: baseContext };
}
