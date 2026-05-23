import { describe, it, expect, beforeEach } from 'vitest';
import { actionScopeWithinContractPredicate } from '../../../lib/compliance/predicates/governance/action-scope-within-contract';
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

describe('governance action_scope_within_contract predicate (Bubble 8a real)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(actionScopeWithinContractPredicate);
  });

  it('registers the composite predicate by name', () => {
    const p = getComposite('action_scope_within_contract');
    expect(p).toBeDefined();
    expect(p?.name).toBe('action_scope_within_contract');
  });

  it("returns 'pass' when action_name is in declared_scope", async () => {
    const result = await actionScopeWithinContractPredicate.evaluate(
      { action_name: 'send_email', declared_scope: ['send_email', 'archive_reply'] },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.action_name).toBe('send_email');
  });

  it("returns 'fail' when action_name is outside declared_scope", async () => {
    const result = await actionScopeWithinContractPredicate.evaluate(
      { action_name: 'drop_database', declared_scope: ['send_email', 'archive_reply'] },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/not in the contract's declared_scope/);
    expect(result.details.action_name).toBe('drop_database');
    expect(result.details.declared_scope).toEqual(['send_email', 'archive_reply']);
  });

  it('isAllowable accepts pass-only trace and rejects fail-containing trace', () => {
    const passEvals: CompositePredicateEvaluation[] = [
      { predicate: 'action_scope_within_contract', result: 'pass', reason: '', details: {} },
    ];
    expect(isAllowable(passEvals)).toBe(true);
    const failEvals: CompositePredicateEvaluation[] = [
      { predicate: 'action_scope_within_contract', result: 'fail', reason: '', details: {} },
    ];
    expect(isAllowable(failEvals)).toBe(false);
  });
});
