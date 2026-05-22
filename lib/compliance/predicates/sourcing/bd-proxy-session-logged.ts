// Sourcing Bright Data proxy session-log composite predicate.
// Bright Data integration day wires real BD audit-log lookup
// against the Unlocker/Browser session identifier.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface BdProxySessionInput {
  /** BD Unlocker / Scraping Browser session (or job) identifier. */
  session_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['session_id'],
  properties: {
    session_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'bd_proxy_session_logged';

export const bdProxySessionLoggedPredicate: CompositePredicate<BdProxySessionInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'BD proxy session-log retention check not yet implemented',
      details: {
        session_id: input.session_id,
        would_check: 'bd_unlocker_or_browser_session_id_retained_in_bd_audit_log',
        deferred_to: 'Bright Data integration day (BD session audit log)',
      },
    };
  },
};
