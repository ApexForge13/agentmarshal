// Scope Contract evaluator + AuthZEN response mapper.
// Day 2: stub — always returns allow per the stub contract.
// Day 3+: full MatchPredicates → Decision flow per scope-contract.schema.json.

import { loadContractForAgent } from './contracts';
import type {
  AuthZenRequest,
  AuthZenResponse,
  EvaluationResult,
  PredicateEvaluation,
} from '@/types/authzen';

export async function evaluateRequest(request: AuthZenRequest): Promise<EvaluationResult> {
  const contract = await loadContractForAgent(request.subject.id);
  const matchedRule = contract.declared_scope[0];

  const predicate_evaluations: PredicateEvaluation[] = [
    {
      rule_id: matchedRule.rule_id,
      predicate_path: '(stub)',
      constraint: '(stub-allow-all)',
      result: 'pass',
      reason: 'Day 2 stub: no predicates evaluated. Real evaluator lands Day 3.',
    },
  ];

  return {
    effect: matchedRule.decision.effect,
    evaluation_path: 'declared_scope',
    matched_rule_id: matchedRule.rule_id,
    out_of_scope_term: null,
    reason_code: matchedRule.decision.reason_code,
    reason: matchedRule.decision.reason,
    predicate_evaluations,
  };
}

/**
 * Map Scope Contract result to AuthZEN response.
 * Per audit-record schema: allow→true; deny→false; escalate→false (step-up in context).
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
