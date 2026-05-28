// Registers the Bright Data governance composite predicates (Bubble 17).
// These run inside the MCP proxy's bd_permissions evaluation (lib/mcp/govern.ts),
// not the declared_scope evaluator. Side-effect import populates the registry;
// explicit registerAllBdComposites() is exported for test setup and grep-ability.
// Mirrors registerAllTradingComposites / registerAllGovernanceComposites.

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { bdServiceAuthorizedPredicate } from './bd_service_authorized';
import { bdQueryPurposeMatchesPredicate } from './bd_query_purpose_matches';
import { bdDomainInScopePredicate } from './bd_domain_in_scope';
import { bdPassthroughToolInAllowlistPredicate } from './bd_passthrough_tool_in_allowlist';

export function registerAllBdComposites(): void {
  registerComposite(bdServiceAuthorizedPredicate);
  registerComposite(bdQueryPurposeMatchesPredicate);
  registerComposite(bdDomainInScopePredicate);
  // Bubble 20: gates which BD MCP tools the governed passthrough may forward.
  registerComposite(bdPassthroughToolInAllowlistPredicate);
}

registerAllBdComposites();

export {
  bdServiceAuthorizedPredicate,
  bdQueryPurposeMatchesPredicate,
  bdDomainInScopePredicate,
  bdPassthroughToolInAllowlistPredicate,
};
