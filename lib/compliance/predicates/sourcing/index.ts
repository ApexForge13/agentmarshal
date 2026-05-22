// Registers all 8 sourcing composite predicates (5 BD provenance + 3 sourcing).
// Side-effect import populates the registry; explicit registerAllSourcingComposites()
// is exported for test setup (clearComposites + re-register) and grep-ability
// (so tree-shake or rename-refactors surface the registration call site).

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { dataSourceProvenanceRecordedPredicate } from './data-source-provenance-recorded';
import { bdDatasetSubscriptionActivePredicate } from './bd-dataset-subscription-active';
import { bdProxySessionLoggedPredicate } from './bd-proxy-session-logged';
import { dataAcquisitionTosCompliantPredicate } from './data-acquisition-tos-compliant';
import { piiFieldHandlingDocumentedPredicate } from './pii-field-handling-documented';
import { sourceRobotsTxtHonoredPredicate } from './source-robots-txt-honored';
import { sourcePublicRecordStatusVerifiedPredicate } from './source-public-record-status-verified';
import { sourceAttributionRetainedPredicate } from './source-attribution-retained';

export function registerAllSourcingComposites(): void {
  registerComposite(dataSourceProvenanceRecordedPredicate);
  registerComposite(bdDatasetSubscriptionActivePredicate);
  registerComposite(bdProxySessionLoggedPredicate);
  registerComposite(dataAcquisitionTosCompliantPredicate);
  registerComposite(piiFieldHandlingDocumentedPredicate);
  registerComposite(sourceRobotsTxtHonoredPredicate);
  registerComposite(sourcePublicRecordStatusVerifiedPredicate);
  registerComposite(sourceAttributionRetainedPredicate);
}

registerAllSourcingComposites();

export {
  dataSourceProvenanceRecordedPredicate,
  bdDatasetSubscriptionActivePredicate,
  bdProxySessionLoggedPredicate,
  dataAcquisitionTosCompliantPredicate,
  piiFieldHandlingDocumentedPredicate,
  sourceRobotsTxtHonoredPredicate,
  sourcePublicRecordStatusVerifiedPredicate,
  sourceAttributionRetainedPredicate,
};
