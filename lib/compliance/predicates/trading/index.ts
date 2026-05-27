// Registers the trading-desk composite predicate(s).
// Bubble 13 PRE-scaffold for the v0.2 OFAC-sanctions hero arc: entity_not_sanctioned
// screens an action's counterparty/target entity against the OFAC SDN list supplied
// at runtime via action_properties. Side-effect import populates the registry;
// explicit registerAllTradingComposites() is exported for test setup and grep-ability.
// Bubble 19 adds entity_adverse_media_check (v1, real SERP→Crawl keyword scoring);
// the Bubble 17 v0 (pass-always) is kept registered, deprecated, for backward compat.

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { entityNotSanctionedPredicate } from './entity-not-sanctioned';
import { entityAdverseMediaCheckPredicate } from './entity-adverse-media-check';
import { entityAdverseMediaCheckV0Predicate } from './entity-adverse-media-check-v0';

export function registerAllTradingComposites(): void {
  registerComposite(entityNotSanctionedPredicate);
  // Bubble 19: real adverse-media scoring — governed SERP → Crawl → keyword interpretation.
  registerComposite(entityAdverseMediaCheckPredicate);
  // Bubble 17 v0 (deprecated, pass-always): kept registered for backward compat.
  registerComposite(entityAdverseMediaCheckV0Predicate);
}

registerAllTradingComposites();

export {
  entityNotSanctionedPredicate,
  entityAdverseMediaCheckPredicate,
  entityAdverseMediaCheckV0Predicate,
};
