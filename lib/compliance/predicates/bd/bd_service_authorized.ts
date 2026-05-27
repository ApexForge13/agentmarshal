// bd_service_authorized composite predicate (Bubble 17).
//
// One of the two governance checks a bd_permissions rule runs before the MCP
// proxy forwards a Bright Data call. Passes when the BD call's `service` is
// authorized by some rule in the contract's bd_permissions. Mirrors the
// entity_not_sanctioned pattern: no issuance-time input; runtime state rides
// ctx.action_properties, threaded by lib/mcp/govern.ts:
//
//   action_properties.bd_call        : { service, tool, parameters }
//   action_properties.bd_permissions : the contract's bd_permissions rules
//
// Outcomes (fail-safe; isAllowable permits pass-only):
//   - bd_call.service or bd_permissions absent → STUB  (unresolved input)
//   - service ∈ {rule.match.service}           → PASS
//   - otherwise                                → FAIL

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type BdServiceAuthorizedInput = Record<string, never>;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const PREDICATE_NAME = 'bd_service_authorized';

/** Reads action_properties.bd_call.service; null if absent/malformed. */
function readBdCallService(props: Record<string, unknown> | undefined): string | null {
  const call = props?.['bd_call'];
  if (typeof call !== 'object' || call === null) return null;
  const service = (call as Record<string, unknown>)['service'];
  return typeof service === 'string' && service.length > 0 ? service : null;
}

/**
 * Collects the services authorized by the contract's bd_permissions rules
 * (rule.match.service). null when bd_permissions is absent/malformed (unresolved);
 * an empty array is a valid result (contract authorizes no BD service).
 */
function readAuthorizedServices(props: Record<string, unknown> | undefined): string[] | null {
  const perms = props?.['bd_permissions'];
  if (!Array.isArray(perms)) return null;
  const services: string[] = [];
  for (const rule of perms) {
    const service = (rule as Record<string, unknown> | null)?.['match'];
    const svc =
      typeof service === 'object' && service !== null
        ? (service as Record<string, unknown>)['service']
        : undefined;
    if (typeof svc === 'string') services.push(svc);
  }
  return services;
}

export const bdServiceAuthorizedPredicate: CompositePredicate<BdServiceAuthorizedInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(_input, ctx): Promise<CompositePredicateEvaluation> {
    const service = readBdCallService(ctx.action_properties);
    const authorized = readAuthorizedServices(ctx.action_properties);

    if (service === null || authorized === null) {
      const missing: string[] = [];
      if (service === null) missing.push('bd_call.service');
      if (authorized === null) missing.push('bd_permissions');
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: `bd_service_authorized unresolved (missing: ${missing.join(', ')})`,
        details: {
          unresolved: true,
          missing,
          reasons: ['BD service authorization could not resolve: required runtime state absent'],
        },
      };
    }

    if (authorized.includes(service)) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `service ${service} authorized by a bd_permissions rule`,
        details: { service, authorized_services: authorized },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: `service ${service} not authorized by any bd_permissions rule`,
      details: {
        service,
        authorized_services: authorized,
        reasons: ['BD call service is not declared by any bd_permissions rule in the contract'],
      },
    };
  },
};
