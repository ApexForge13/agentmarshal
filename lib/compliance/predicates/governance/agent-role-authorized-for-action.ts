// Agent-role-authorized-for-action composite predicate (REAL, not stub).
// Each agent type has a closed list of authorized action names (per
// agents.md §1 + §2). Requests whose action_name is outside the agent's
// authorized set fail (catches role-boundary violations: e.g., a
// LeadScraper attempting to send_email, or a Voice agent attempting to
// scrape_fcc).

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import type { AgentType } from '@/lib/compliance/internal-audit/types';

interface AgentRoleInput {
  agent_type: string;
  action_name: string;
}

// Closed authorization table keyed by the 10 canonical AgentType values.
// New agent actions must be added here; the AgentType compile-time check
// guarantees the table stays in sync with the internal-audit type union.
const AUTHORIZATION_TABLE: Record<AgentType, string[]> = {
  LeadScraper: ['pull_lead', 'enrich_lead', 'store_lead'],
  Validator: ['validate_email', 'validate_phone', 'classify_line_type'],
  InboxAllocator: ['select_inbox', 'route_reply', 'update_inbox_state'],
  Personalizer: ['enrich_personalization', 'score_lead', 'segment_lead', 'render_template_slot'],
  CampaignManager: ['author_template', 'promote_variant', 'retire_variant', 'send_email'],
  ResponseHandler: ['classify_reply', 'archive_reply', 'draft_response', 'escalate_to_human', 'mark_opt_out'],
  COO: ['pause_campaign', 'resume_campaign', 'throttle_send_rate', 'escalate', 'emit_daily_report', 'adjust_pull_rate'],
  InboxProvisioner: ['provision_inbox', 'warm_inbox', 'retire_inbox'],
  Voice: ['accept_call', 'transfer_call', 'hangup_call', 'record_call'],
  RegulatoryMonitor: ['scrape_fcc', 'scrape_pacer', 'scrape_state_ag', 'emit_regulatory_state', 'emit_drift_alert'],
};

const KNOWN_AGENT_TYPES = Object.keys(AUTHORIZATION_TABLE) as AgentType[];

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['agent_type', 'action_name'],
  properties: {
    agent_type: { type: 'string', minLength: 1 },
    action_name: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'agent_role_authorized_for_action';

function isKnownAgentType(value: string): value is AgentType {
  return (KNOWN_AGENT_TYPES as string[]).includes(value);
}

export const agentRoleAuthorizedForActionPredicate: CompositePredicate<AgentRoleInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    if (!isKnownAgentType(input.agent_type)) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `unknown agent_type '${input.agent_type}'; not in canonical 10-agent inventory`,
        details: {
          agent_type: input.agent_type,
          action_name: input.action_name,
          known_agent_types: KNOWN_AGENT_TYPES,
        },
      };
    }

    const authorized = AUTHORIZATION_TABLE[input.agent_type];
    if (!authorized.includes(input.action_name)) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `action '${input.action_name}' is not authorized for agent_type '${input.agent_type}'`,
        details: {
          agent_type: input.agent_type,
          action_name: input.action_name,
          authorized_actions: authorized,
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: `action '${input.action_name}' is authorized for agent_type '${input.agent_type}'`,
      details: {
        agent_type: input.agent_type,
        action_name: input.action_name,
      },
    };
  },
};
