// Registers all 5 governance composite predicates (Bubble 8a).
// These are the first non-TCPA/CAN-SPAM REAL composites in the v0.2
// registry — they return real pass/fail (not stub) evaluations, which
// the upcoming benchmark suite (Bubble 8b) depends on for adversarial-vs-
// legitimate differentiation. Side-effect import populates the registry;
// registerAllGovernanceComposites() is exported for test setup
// (clearComposites + re-register) and grep-ability.

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { crossTenantIsolationEnforcedPredicate } from './cross-tenant-isolation-enforced';
import { actionScopeWithinContractPredicate } from './action-scope-within-contract';
import { spendWithinCapPredicate } from './spend-within-cap';
import { agentRoleAuthorizedForActionPredicate } from './agent-role-authorized-for-action';
import { inputInjectionPatternClearPredicate } from './input-injection-pattern-clear';

export function registerAllGovernanceComposites(): void {
  registerComposite(crossTenantIsolationEnforcedPredicate);
  registerComposite(actionScopeWithinContractPredicate);
  registerComposite(spendWithinCapPredicate);
  registerComposite(agentRoleAuthorizedForActionPredicate);
  registerComposite(inputInjectionPatternClearPredicate);
}

registerAllGovernanceComposites();

export {
  crossTenantIsolationEnforcedPredicate,
  actionScopeWithinContractPredicate,
  spendWithinCapPredicate,
  agentRoleAuthorizedForActionPredicate,
  inputInjectionPatternClearPredicate,
};
