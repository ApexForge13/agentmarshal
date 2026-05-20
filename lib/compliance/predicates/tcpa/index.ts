// Registers all 6 TCPA composite predicates on import.
// Side-effect import: route handler imports this module to populate the registry.

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { quietHoursPredicate } from './quiet-hours';
import { dncRegistryPredicate } from './dnc-registry';
import { consentPredicate } from './consent';
import { revocationPredicate } from './revocation';
import { callerIdPredicate } from './caller-id';
import { robocallDisclosurePredicate } from './robocall-disclosure';

registerComposite(quietHoursPredicate);
registerComposite(dncRegistryPredicate);
registerComposite(consentPredicate);
registerComposite(revocationPredicate);
registerComposite(callerIdPredicate);
registerComposite(robocallDisclosurePredicate);

export {
  quietHoursPredicate,
  dncRegistryPredicate,
  consentPredicate,
  revocationPredicate,
  callerIdPredicate,
  robocallDisclosurePredicate,
};
