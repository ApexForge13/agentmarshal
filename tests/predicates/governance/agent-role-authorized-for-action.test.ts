import { describe, it, expect, beforeEach } from 'vitest';
import { agentRoleAuthorizedForActionPredicate } from '../../../lib/compliance/predicates/governance/agent-role-authorized-for-action';
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

describe('governance agent_role_authorized_for_action predicate (Bubble 8a real)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(agentRoleAuthorizedForActionPredicate);
  });

  it('registers the composite predicate by name', () => {
    const p = getComposite('agent_role_authorized_for_action');
    expect(p).toBeDefined();
    expect(p?.name).toBe('agent_role_authorized_for_action');
  });

  it("returns 'pass' when the action is authorized for the agent_type", async () => {
    const result = await agentRoleAuthorizedForActionPredicate.evaluate(
      { agent_type: 'LeadScraper', action_name: 'pull_lead' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.agent_type).toBe('LeadScraper');
    expect(result.details.action_name).toBe('pull_lead');
  });

  it("returns 'fail' for an unauthorized action or an unknown agent_type", async () => {
    const unauthorized = await agentRoleAuthorizedForActionPredicate.evaluate(
      { agent_type: 'LeadScraper', action_name: 'send_email' },
      makeCtx(),
    );
    expect(unauthorized.result).toBe('fail');
    expect(unauthorized.reason).toMatch(/not authorized/);
    expect(unauthorized.details.authorized_actions).toContain('pull_lead');
    expect(unauthorized.details.authorized_actions).not.toContain('send_email');

    const unknown = await agentRoleAuthorizedForActionPredicate.evaluate(
      { agent_type: 'EvilAgent', action_name: 'send_email' },
      makeCtx(),
    );
    expect(unknown.result).toBe('fail');
    expect(unknown.reason).toMatch(/unknown agent_type/);
    expect(unknown.details.known_agent_types).toEqual(
      expect.arrayContaining(['LeadScraper', 'Voice', 'COO']),
    );
  });

  it('isAllowable accepts pass-only trace and rejects fail-containing trace', () => {
    const passEvals: CompositePredicateEvaluation[] = [
      { predicate: 'agent_role_authorized_for_action', result: 'pass', reason: '', details: {} },
    ];
    expect(isAllowable(passEvals)).toBe(true);
    const failEvals: CompositePredicateEvaluation[] = [
      { predicate: 'agent_role_authorized_for_action', result: 'fail', reason: '', details: {} },
    ];
    expect(isAllowable(failEvals)).toBe(false);
  });
});
