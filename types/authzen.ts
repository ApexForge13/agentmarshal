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
  /**
   * Bubble 16 three-state sibling. `decision` stays a strict AuthZEN 1.0 boolean;
   * `review_required` carries the richer status when a composite returns `review`
   * (decision is false but the block is "pending human review", not a hard deny).
   * Absent ⇒ false. `review_reason` is set only when review_required is true.
   */
  review_required?: boolean;
  review_reason?: string;
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
  /**
   * Composite predicate evaluations produced during this evaluation, in order.
   * Structurally identical to CompositePredicateEvaluation in lib/authzen/composite-dispatch.ts
   * (kept inline to avoid a types -> lib import cycle through audit-record.ts).
   */
  composite_evaluations?: Array<{
    predicate: string;
    result: 'pass' | 'fail' | 'stub' | 'review';
    reason: string;
    details: Record<string, unknown>;
  }>;
  /**
   * Bubble 16 three-state. Set true when some composite returned `review` and none
   * returned `fail` (fail trumps review). When true, effect is non-allow (the
   * review blocks the action) and review_reason carries the first review reason.
   * Omitted ⇒ false. Flows to the AuthZEN response sibling + the signed record.
   */
  review_required?: boolean;
  review_reason?: string;
  /**
   * Bubble 17: audit entries for Bright Data calls made through the MCP proxy
   * during this evaluation (e.g. by entity_adverse_media_check_v0). Flows to the
   * signed record's bd_calls[]. Omitted when no BD call was made.
   */
  bd_calls?: BDCallAudit[];
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

// === Day 3: Scope Contract evaluation types ===

/**
 * Predicate constraint as it appears in a Scope Contract Predicate slot:
 * either a literal value (exact equality) or an operator object with one or more operators.
 * Per spec, multiple operators in the same object MUST all hold (implicit AND).
 */
export type PredicateConstraint =
  | string
  | number
  | boolean
  | null
  | PredicateOperators;

export interface PredicateOperators {
  equals?: unknown;
  not_equals?: unknown;
  in?: unknown[];
  not_in?: unknown[];
  pattern?: string;
  min?: number;
  max?: number;
  between?: [number, number];
  before?: string;
  after?: string;
  currency?: string;
  time_window?: TimeWindowConstraint;
  exists?: boolean;
  not_exists?: boolean;
}

export interface TimeWindowConstraint {
  timezone: string;
  windows: Array<{
    start: string;
    end: string;
    weekdays?: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  }>;
}

/** Context passed through predicate evaluation. Mockable `now` for deterministic tests. */
export interface PredicateContext {
  now?: Date;
}

/** Outcome of a single predicate evaluation. */
export interface PredicateOutcome {
  result: 'pass' | 'fail';
  reason?: string;
}

/** Monetary value shape — used as actualValue when predicate uses `currency` operator. */
export interface MonetaryValue {
  amount: number;
  currency: string;
}

// === Day 3 Bubble 2: ScopeContract structural types ===

export interface ScopeContract {
  scope_contract_version: '0.1';
  contract_id: string;
  tenant_id?: string;
  agent_id: string;
  issuer: {
    type: 'operator' | 'service' | 'system';
    id: string;
    display_name?: string;
  };
  issued_at: string;
  not_before?: string;
  expires_at?: string;
  supersedes?: string;
  version?: number;
  declared_scope: ScopeRule[];
  out_of_scope?: OutOfScopeEntry[];
  escalation?: EscalationConfig;
  extensions?: Record<string, unknown>;
  /**
   * Bubble 17: optional Bright Data call-authorization rules. Consulted ONLY by
   * the MCP proxy (lib/mcp/govern.ts) when an agent governed by this contract
   * attempts a BD tool call; the declared_scope evaluator ignores this field.
   * Absent ⇒ deny-all for BD calls.
   */
  bd_permissions?: BDPermissionRule[];
}

export type OutOfScopeEntry =
  | string
  | { action: string }
  | { capability_category: string };

export interface ScopeRule {
  rule_id: string;
  description?: string;
  match: MatchPredicates;
  /**
   * Optional composite predicate checks. All must pass (via isAllowable) for the
   * rule's decision.effect to apply. Any fail/stub causes the rule to be treated
   * as non-matching (evaluator continues to the next rule).
   */
  composite_checks?: CompositeCheck[];
  decision: Decision;
}

export interface CompositeCheck {
  /** Name of the composite predicate as registered via registerComposite. */
  predicate: string;
  /** Input passed to the composite's evaluate(). Validated against the composite's inputSchema. */
  input: unknown;
}

export interface MatchPredicates {
  subject?: EntityPredicate;
  action?: EntityPredicate;
  resource?: EntityPredicate;
  context?: EntityPredicate;
}

export interface EntityPredicate {
  type?: PredicateConstraint;
  id?: PredicateConstraint;
  name?: PredicateConstraint;
  capability_category?: PredicateConstraint;
  vendor_ref?: PredicateConstraint;
  properties?: Record<string, PredicateConstraint>;
}

export interface Decision {
  effect: ScopeContractEffect;
  escalation_target?: string;
  reason_code?: string;
  reason?: string;
  audit_level?: 'debug' | 'info' | 'warn' | 'alert';
}

export interface EscalationConfig {
  targets: Record<string, EscalationTarget>;
  default_target?: string;
}

export interface EscalationTarget {
  method: 'sms' | 'email' | 'webhook' | 'in_app' | 'queue';
  address: string;
  timeout_seconds?: number;
  on_timeout?: 'deny' | 'allow' | 'escalate_again';
}

// === Bubble 17: Bright Data (BD) call-authorization permissions ===
// Consulted by the MCP proxy (lib/mcp/govern.ts), NOT by the declared_scope
// evaluator. Mirrors scope-contract.schema.json $defs BDPermissionRule.

export type BDService =
  | 'serp_api'
  | 'web_unlocker'
  | 'scraping_browser'
  | 'web_scraper_api'
  | 'proxies'
  | 'scraper_studio'
  | 'mcp_server';

/**
 * Predicate over a single BD call parameter. At least one operator. Distinct from
 * PredicateOperators (the declared_scope vocabulary): adds `domain_in` (URL-hostname
 * match) and uses `matches` for regex rather than `pattern`.
 */
export interface BDParameterPredicate {
  equals?: unknown;
  in?: unknown[];
  exists?: boolean;
  matches?: string;
  domain_in?: string[];
}

export interface BDPermissionMatch {
  service: BDService;
  tool?: string;
  parameters?: Record<string, BDParameterPredicate>;
}

export interface BDConstraints {
  max_calls_per_evaluation?: number;
  max_calls_per_minute?: number;
  max_cost_credits?: number;
  response_handling?: 'fingerprint' | 'cache' | 'no_cache' | 'pii_scrub';
  max_response_size_kb?: number;
}

/**
 * A single Bright Data call-authorization rule. The first rule whose `match`
 * predicate holds AND whose `composite_checks` all pass fires its `permit`
 * decision; no matching+passing rule ⇒ implicit deny.
 */
export interface BDPermissionRule {
  rule_id: string;
  description?: string;
  match: BDPermissionMatch;
  constraints?: BDConstraints;
  /** Names of composite predicates (by id) that must all pass for this rule to fire. */
  composite_checks?: string[];
  decision: 'permit';
}

/** Outcome of one composite check run during BD-call governance. */
export interface BDCompositeOutcome {
  composite: string;
  // Inlined union (matches CompositeResult in lib/authzen/composite-dispatch.ts);
  // kept inline to avoid a types -> lib import cycle.
  result: 'pass' | 'fail' | 'stub' | 'review';
}

/**
 * Audit record of one governed Bright Data call, captured into a signed
 * receipt/record's bd_calls[]. Produced by the MCP proxy (lib/mcp). Execution
 * fields are null when the call was denied (never executed) or when execution
 * failed before a response was captured.
 */
export interface BDCallAudit {
  service: BDService;
  tool: string;
  parameters: Record<string, unknown>;
  matched_rule_id: string | null;
  governance_result: 'permit' | 'deny';
  composite_outcomes: BDCompositeOutcome[];
  executed_at: string | null;
  duration_ms: number | null;
  response_sha256: string | null;
  response_size_bytes: number | null;
  bd_request_id: string | null;
}
