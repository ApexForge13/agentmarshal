// Cross-tenant isolation composite predicate (REAL, not stub).
// Verifies that a request's subject and resource tenants are both declared
// and identical. Cross-tenant references — whether by accident or by an
// adversarial agent attempting to read another tenant's data — fail.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface CrossTenantInput {
  subject_tenant_id?: string;
  resource_tenant_id?: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    subject_tenant_id: { type: 'string', minLength: 1 },
    resource_tenant_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'cross_tenant_isolation_enforced';

export const crossTenantIsolationEnforcedPredicate: CompositePredicate<CrossTenantInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const subj = input.subject_tenant_id;
    const res = input.resource_tenant_id;

    if (!subj || !res) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `tenant_id missing on ${!subj && !res ? 'subject and resource' : !subj ? 'subject' : 'resource'}`,
        details: {
          subject_tenant_id: subj ?? null,
          resource_tenant_id: res ?? null,
          missing: !subj && !res ? ['subject', 'resource'] : !subj ? ['subject'] : ['resource'],
        },
      };
    }

    if (subj !== res) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `cross-tenant access: subject_tenant_id (${subj}) ≠ resource_tenant_id (${res})`,
        details: {
          subject_tenant_id: subj,
          resource_tenant_id: res,
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: 'subject and resource tenant_id match',
      details: { tenant_id: subj },
    };
  },
};
