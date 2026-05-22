// Registers all 4 voice composite predicates (runtime checks for the Voice agent).
// Side-effect import populates the registry; explicit registerAllVoiceComposites()
// is exported for test setup (clearComposites + re-register) and grep-ability
// (so tree-shake or rename-refactors surface the registration call site).
//
// Two of the four are runtime-check complements to existing TCPA declarative
// checks: voice_prerecorded_disclosure_present ↔ tcpa_robocall_disclosure_present
// and voice_caller_id_accurate ↔ tcpa_caller_id_disclosed. Both members of each
// pair must pass for the corresponding outbound voice action.

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { voiceRecordingConsentStateResolvedPredicate } from './voice-recording-consent-state-resolved';
import { voiceAbandonmentRateCompliantPredicate } from './voice-abandonment-rate-compliant';
import { voicePrerecordedDisclosurePresentPredicate } from './voice-prerecorded-disclosure-present';
import { voiceCallerIdAccuratePredicate } from './voice-caller-id-accurate';

export function registerAllVoiceComposites(): void {
  registerComposite(voiceRecordingConsentStateResolvedPredicate);
  registerComposite(voiceAbandonmentRateCompliantPredicate);
  registerComposite(voicePrerecordedDisclosurePresentPredicate);
  registerComposite(voiceCallerIdAccuratePredicate);
}

registerAllVoiceComposites();

export {
  voiceRecordingConsentStateResolvedPredicate,
  voiceAbandonmentRateCompliantPredicate,
  voicePrerecordedDisclosurePresentPredicate,
  voiceCallerIdAccuratePredicate,
};
