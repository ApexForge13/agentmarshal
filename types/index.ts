// Shared types for AgentMarshal.
//
// Wire-format and engine types live here so every layer agrees on the same
// shape. TS surface is camelCase; the YAML/SQL layers keep snake_case (we map
// at the boundary in audit-log.ts and policy-engine.ts).

import type { Op } from '@/lib/policy-matchers';

export type Action = 'ALLOW' | 'HUMAN_REVIEW' | 'DENY';

/** @deprecated Use `Action`. Kept for one release while callers migrate. */
export type Verdict = Action;

export interface AgentScope {
  can: string[];
  cannot: string[];
  tools?: string[];
  constraints?: Record<string, number | string>;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  declared_scope: AgentScope;
}

// Mirrors the PromptMetadata struct returned by Lobster Trap.
// Field names match the Go JSON tags (snake_case).
export interface LobsterTrapMetadata {
  intent_category: string;
  intent_confidence: number;
  risk_score: number;
  contains_code: boolean;
  contains_credentials: boolean;
  contains_pii: boolean;
  contains_pii_request: boolean;
  contains_system_commands: boolean;
  contains_malware_request: boolean;
  contains_phishing_patterns: boolean;
  contains_role_impersonation: boolean;
  contains_exfiltration: boolean;
  contains_harm_patterns: boolean;
  contains_obfuscation: boolean;
  contains_injection_patterns: boolean;
  contains_file_paths: boolean;
  contains_sensitive_paths: boolean;
  contains_urls: boolean;
  target_paths: string[] | null;
  target_domains: string[] | null;
  target_commands: string[] | null;
  token_count: number;
}

export interface PolicyRuleHit {
  name: string;
  flag: string;
  description: string;
}

export interface AttemptedAction {
  tool: string;
  args: Record<string, unknown>;
}

// Engine output. Agent identity, attempted action, and LT metadata live on
// AuditEntry, not here — evaluate() doesn't need to echo them back.
export interface PolicyDecision {
  action: Action;
  rulesFired: PolicyRuleHit[];
  declaredScope: string;
  declaredIntent: string;
  detectedIntent: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// Engine input.
export interface EvaluateInput {
  agentId: string;
  declaredScope: string;
  declaredIntent: string;
  attemptedAction: AttemptedAction;
  lobsterTrapMetadata: LobsterTrapMetadata;
  agentmarshalContext?: Record<string, unknown>;
}

// Audit row.
export interface AuditEntry extends PolicyDecision {
  id: number;
  agentId: string;
  attemptedAction?: AttemptedAction;
  lobsterTrapMetadata: LobsterTrapMetadata;
  agentmarshalContext: Record<string, unknown>;
  rawInput?: string;
  dollarImpact?: number;
}

// ---------------------------------------------------------------------------
// Loaded-YAML types. snake_case is preserved verbatim from the YAML idiom.
// Don't camelCase these — keep YAML and TS readable side-by-side.
// ---------------------------------------------------------------------------

export interface Condition {
  source: 'lobstertrap' | 'agentmarshal';
  field: string;
  // Verbose form:
  op?: Op;
  value?: unknown;
  // Op-as-key shorthand (mutually exclusive with op/value):
  match?: unknown;
  contains?: unknown;
  regex?: string;
  not_matches?: string;
  less_than?: number;
  greater_than?: number;
  threshold?: number;
  boolean?: boolean;
}

export interface PolicyRule {
  name: string;
  priority: number;
  action: Action;
  description?: string;
  conditions: Condition[];
  flag?: string;
  escalate_to?: string;
}

export interface AgentDeclaration {
  id: string;
  name: string;
  role: string;
  declared_scope: { can: string[]; cannot: string[] };
  constraints?: Record<string, unknown>;
  tools: string[];
}

export interface Vendor {
  name: string;
  vendor_id: string;
  contact_email?: string;
  payment_account?: string;
  contact_phone?: string;
  requires_approval_above?: number;
}

export interface AuditConfig {
  log_all_decisions?: boolean;
  retention_days?: number;
  include_lobstertrap_metadata?: boolean;
  include_declared_vs_detected_diff?: boolean;
}

export interface PolicyDocument {
  version: string | number;
  operator?: string;
  operator_email?: string;
  company?: string;
  fleet_id?: string;
  agents?: AgentDeclaration[];
  vendors?: { approved: Vendor[] };
  policy_rules: PolicyRule[];
  default_action?: Action;
  audit?: AuditConfig;
}
