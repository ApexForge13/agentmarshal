// Emission policy: maps an AgentMarshal agent type to the kind of signed
// record that should be issued for an evaluation involving that agent.
//
// Source of truth: spec/v0.1/agents.md §1 "Compliance Receipts?" column.
// Customer-touching agents (CampaignManager outbound sends, ResponseHandler
// inbound classifications, Voice call accepts + mid-call re-evaluations)
// emit a `compliance_receipt`. All other v0.2 agents emit an
// `internal_audit` envelope under the shared signing/chaining substrate.
//
// Default for unknown / missing agent.type: `internal_audit`. Customer-
// touching emission is restricted to the closed set above; an unrecognised
// type cannot escalate to a Compliance Receipt by accident.

import type { AgentType } from '@/lib/compliance/internal-audit/types';

export type EmissionType = 'compliance_receipt' | 'internal_audit';

const COMPLIANCE_RECEIPT_TYPES: ReadonlySet<AgentType> = new Set<AgentType>([
  'CampaignManager',
  'ResponseHandler',
  'Voice',
]);

const KNOWN_AGENT_TYPES: ReadonlySet<AgentType> = new Set<AgentType>([
  'LeadScraper',
  'Validator',
  'InboxAllocator',
  'Personalizer',
  'CampaignManager',
  'ResponseHandler',
  'COO',
  'InboxProvisioner',
  'Voice',
  'RegulatoryMonitor',
]);

/** Returns true if the supplied string is one of the 10 canonical agent types. */
export function isKnownAgentType(value: string | undefined | null): value is AgentType {
  return typeof value === 'string' && KNOWN_AGENT_TYPES.has(value as AgentType);
}

/**
 * Maps an agent type to the record kind that the evaluation endpoint should
 * emit. Pass-through for known types; safe default for unknown/missing.
 */
export function emissionTypeFor(agentType: string | undefined | null): EmissionType {
  if (isKnownAgentType(agentType) && COMPLIANCE_RECEIPT_TYPES.has(agentType)) {
    return 'compliance_receipt';
  }
  return 'internal_audit';
}

/**
 * Fallback agent type used when the incoming agent.type is not one of the 10
 * canonical values but we still need to populate the InternalAuditAgent.type
 * field (which is schema-constrained to the closed enum). The actual unknown
 * value is preserved in the envelope's action.inputs by the caller.
 */
export const UNKNOWN_AGENT_TYPE_FALLBACK: AgentType = 'COO';
