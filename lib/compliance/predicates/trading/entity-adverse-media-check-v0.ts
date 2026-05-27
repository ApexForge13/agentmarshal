// entity_adverse_media_check_v0 composite predicate (Bubble 17 — PRE-scaffold).
//
// During a trading evaluation, screens the action's counterparty/target entity for
// adverse media by making a GOVERNED Bright Data SERP call THROUGH the MCP proxy
// (lib/mcp/serp-tool → governMCPCall + bdSerpSearch). The resulting bd_call audit
// entry is pushed onto ctx.bd_calls so it rides the signed record.
//
// v0 (Bubble 17): records that the call happened and returns PASS regardless of the
// SERP results — real adverse-media interpretation (entity resolution, sentiment,
// hit scoring → pass/review/fail) landed in Bubble 19 (entity_adverse_media_check).
// The proxy executes the BD call only when credentials are present (bdSerpSearch
// throws BdConfigError otherwise, caught inside the tool), so the evaluator stays
// hermetic in environments without a BD token — it then records a governance-only
// bd_call.
//
// Inputs:
//   - action_properties.entity.id : the counterparty to screen
//   - ctx.subject {id, type}       : resolves the agent's Scope Contract for governance

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import { runSerpAdverseMediaSearch } from '@/lib/mcp/serp-tool';

type EntityAdverseMediaCheckInput = Record<string, never>;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const PREDICATE_NAME = 'entity_adverse_media_check_v0';

/** Reads action_properties.entity.id; null if absent/malformed. */
function readEntityId(props: Record<string, unknown> | undefined): string | null {
  const entity = props?.['entity'];
  if (typeof entity !== 'object' || entity === null) return null;
  const id = (entity as Record<string, unknown>)['id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * @deprecated since Bubble 19 (2026-05-27). Use entity_adverse_media_check (v1,
 * ./entity-adverse-media-check.ts) which scores extracted article content against a
 * financial-crime keyword list, returning pass/review/fail. v0 is preserved for
 * backward compat with any benchmark or test still pinned to its pass-always
 * semantics; scheduled for removal in v0.3.
 */
export const entityAdverseMediaCheckV0Predicate: CompositePredicate<EntityAdverseMediaCheckInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(_input, ctx): Promise<CompositePredicateEvaluation> {
    const entityId = readEntityId(ctx.action_properties);

    // Nothing to screen (no counterparty entity, or no resolvable subject) → pass
    // without a BD call. Keeps non-trading / fixture contexts free of stray calls.
    if (entityId === null || !ctx.subject) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: 'no counterparty entity to screen; adverse-media check skipped',
        details: { skipped: true, v0_note: 'Bubble 17 PRE-scaffold' },
      };
    }

    const query = `${entityId} sanctions OR fraud OR investigation OR enforcement`;
    const out = await runSerpAdverseMediaSearch({
      agent_id: ctx.subject.id,
      subject_type: ctx.subject.type,
      query,
    });

    // Record the (permitted, denied, or attempted-but-failed) call onto the
    // evaluation's collector so it flows into the signed record's bd_calls[].
    ctx.bd_calls?.push(out.bd_call);

    const reason = out.denied
      ? `adverse-media SERP screen blocked by bd_permissions (${out.reason}); recorded for audit`
      : out.ok
        ? `adverse-media SERP screen recorded for ${entityId} (response ${out.bd_call.response_sha256?.slice(0, 12)}…)`
        : `adverse-media SERP screen attempted for ${entityId}; ${out.reason} — recorded for audit`;

    // v0: PASS regardless of results. The bd_call audit entry (governance decision +
    // response fingerprint) is the Bubble 17 deliverable; interpretation is Bubble 19.
    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason,
      details: {
        entity_id: entityId,
        bd_call_recorded: true,
        governance_result: out.bd_call.governance_result,
        executed: out.ok,
        v0_note:
          'Bubble 17 PRE-scaffold: returns pass regardless of SERP results; adverse-media interpretation lands in Bubble 19',
      },
    };
  },
};
