// Registers the trading-desk composite predicate(s).
// Bubble 13 PRE-scaffold for the v0.2 OFAC-sanctions hero arc: entity_not_sanctioned
// screens an action's counterparty/target entity against the OFAC SDN list supplied
// at runtime via action_properties. Side-effect import populates the registry;
// explicit registerAllTradingComposites() is exported for test setup and grep-ability.
// Singular registration (one predicate) kept for API uniformity with the other domain
// registries (registerAllVoiceComposites, registerAllGovernanceComposites,
// registerAllSmsComposites, ...). Richer trading composites (leverage caps,
// large-trade thresholds, post-trade reconciliation) land in later bubbles.

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { entityNotSanctionedPredicate } from './entity-not-sanctioned';

export function registerAllTradingComposites(): void {
  registerComposite(entityNotSanctionedPredicate);
}

registerAllTradingComposites();

export { entityNotSanctionedPredicate };
