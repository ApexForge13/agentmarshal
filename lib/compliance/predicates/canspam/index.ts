// Registers all 6 CAN-SPAM composite predicates.
// Side-effect import populates the registry; explicit registerAllCanspamComposites()
// is exported for test setup (clearComposites + re-register) and grep-ability
// (so tree-shake or rename-refactors surface the registration call site).

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { unsubscribeLinkPredicate } from './unsubscribe-link';
import { unsubscribeMechanismPredicate } from './unsubscribe-mechanism';
import { postalAddressPredicate } from './postal-address';
import { senderIdPredicate } from './sender-id';
import { subjectDeceptionPredicate } from './subject-deception';
import { advertisementDisclosurePredicate } from './advertisement-disclosure';

export function registerAllCanspamComposites(): void {
  registerComposite(unsubscribeLinkPredicate);
  registerComposite(unsubscribeMechanismPredicate);
  registerComposite(postalAddressPredicate);
  registerComposite(senderIdPredicate);
  registerComposite(subjectDeceptionPredicate);
  registerComposite(advertisementDisclosurePredicate);
}

registerAllCanspamComposites();

export {
  unsubscribeLinkPredicate,
  unsubscribeMechanismPredicate,
  postalAddressPredicate,
  senderIdPredicate,
  subjectDeceptionPredicate,
  advertisementDisclosurePredicate,
};
