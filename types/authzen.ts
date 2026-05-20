// AuthZEN v0.2 type definitions for AgentMarshal.
// Wire shapes follow OpenID AuthZEN 1.0 spec.
// Scope Contract / Audit Record evaluation types match spec/v0.1/*.schema.json.

export interface AuthZenSubject {
  type: string;
  id: string;
  properties?: Record<string, unknown>;
}

export interface AuthZenAction {
  name: string;
  properties?: Record<string, unknown>;
}

export interface AuthZenResource {
  type: string;
  id: string;
  properties?: Record<string, unknown>;
}

export type AuthZenContext = Record<string, unknown>;

/** POST /access/v1/evaluation request body */
export interface AuthZenRequest {
  subject: AuthZenSubject;
  action: AuthZenAction;
  resource: AuthZenResource;
  context?: AuthZenContext;
}

/** AuthZEN response. decision:true = allow; decision:false = deny OR escalate. */
export interface AuthZenResponse {
  decision: boolean;
  context?: Record<string, unknown>;
}

/** Scope Contract-level effect (richer than the AuthZEN boolean). */
export type ScopeContractEffect = 'allow' | 'deny' | 'escalate';

/** Internal result of evaluating an AuthZEN request against a Scope Contract. */
export interface EvaluationResult {
  effect: ScopeContractEffect;
  evaluation_path: 'temporal' | 'out_of_scope' | 'declared_scope' | 'no_match';
  matched_rule_id: string | null;
  out_of_scope_term: string | { action?: string; capability_category?: string } | null;
  reason_code: string;
  reason: string;
  predicate_evaluations: PredicateEvaluation[];
}

/** Per-predicate evaluation record — matches audit-record schema PredicateEvaluation $def. */
export interface PredicateEvaluation {
  rule_id: string | null;
  predicate_path: string;
  constraint: unknown;
  actual_value?: unknown;
  result: 'pass' | 'fail' | 'skipped';
  reason?: string;
}
