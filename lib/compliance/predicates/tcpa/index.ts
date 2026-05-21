// Registers all 6 TCPA composite predicates.
// Side-effect import populates the registry; explicit registerAllTcpaComposites()
// is exported for test setup (clearComposites + re-register) and grep-ability
// (so tree-shake or rename-refactors surface the registration call site).

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { quietHoursPredicate } from './quiet-hours';
import { dncRegistryPredicate } from './dnc-registry';
import { consentPredicate } from './consent';
import { revocationPredicate } from './revocation';
import { callerIdPredicate } from './caller-id';
import { robocallDisclosurePredicate } from './robocall-disclosure';

export function registerAllTcpaComposites(): void {
  registerComposite(quietHoursPredicate);
  registerComposite(dncRegistryPredicate);
  registerComposite(consentPredicate);
  registerComposite(revocationPredicate);
  registerComposite(callerIdPredicate);
  registerComposite(robocallDisclosurePredicate);
}

registerAllTcpaComposites();

export {
  quietHoursPredicate,
  dncRegistryPredicate,
  consentPredicate,
  revocationPredicate,
  callerIdPredicate,
  robocallDisclosurePredicate,
};
