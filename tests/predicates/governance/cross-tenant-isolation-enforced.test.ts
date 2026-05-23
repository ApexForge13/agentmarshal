import { describe, it, expect, beforeEach } from 'vitest';
import { crossTenantIsolationEnforcedPredicate } from '../../../lib/compliance/predicates/governance/cross-tenant-isolation-enforced';
import {
  registerComposite,
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date('2026-05-23T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('governance cross_tenant_isolation_enforced predicate (Bubble 8a real)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(crossTenantIsolationEnforcedPredicate);
  });

  it('registers the composite predicate by name', () => {
    const p = getComposite('cross_tenant_isolation_enforced');
    expect(p).toBeDefined();
    expect(p?.name).toBe('cross_tenant_isolation_enforced');
  });

  it("returns 'pass' when subject and resource tenant_ids match", async () => {
    const result = await crossTenantIsolationEnforcedPredicate.evaluate(
      { subject_tenant_id: 'acme', resource_tenant_id: 'acme' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.tenant_id).toBe('acme');
  });

  it("returns 'fail' on tenant mismatch or missing tenant_id", async () => {
    const mismatch = await crossTenantIsolationEnforcedPredicate.evaluate(
      { subject_tenant_id: 'acme', resource_tenant_id: 'evilcorp' },
      makeCtx(),
    );
    expect(mismatch.result).toBe('fail');
    expect(mismatch.reason).toMatch(/cross-tenant access/i);
    expect(mismatch.details.subject_tenant_id).toBe('acme');
    expect(mismatch.details.resource_tenant_id).toBe('evilcorp');

    const missing = await crossTenantIsolationEnforcedPredicate.evaluate(
      { subject_tenant_id: 'acme' },
      makeCtx(),
    );
    expect(missing.result).toBe('fail');
    expect(missing.reason).toMatch(/missing/i);
    expect(missing.details.missing).toEqual(['resource']);
  });

  it('isAllowable accepts pass-only trace and rejects fail-containing trace', () => {
    const passEvals: CompositePredicateEvaluation[] = [
      { predicate: 'cross_tenant_isolation_enforced', result: 'pass', reason: '', details: {} },
    ];
    expect(isAllowable(passEvals)).toBe(true);
    const failEvals: CompositePredicateEvaluation[] = [
      { predicate: 'cross_tenant_isolation_enforced', result: 'fail', reason: '', details: {} },
    ];
    expect(isAllowable(failEvals)).toBe(false);
  });
});
