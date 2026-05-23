// Registers the SMS deferred composite predicate.
// The SMS marketing surface is deferred to v0.3 per agents.md §3.6 / §7.4 —
// this stub holds the registry slot and produces an audit-traceable
// `result: 'stub'` if any rule ever invokes it before the v0.3 SMS
// implementation lands.
// Singular registration (one predicate) kept for API uniformity with the
// other domain registries (registerAllTcpaComposites, registerAllCanspamComposites,
// registerAllSourcingComposites, registerAllOperationalComposites,
// registerAllVoiceComposites).

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { smsExpressWrittenConsentRecordedPredicate } from './sms-express-written-consent-recorded';

export function registerAllSmsComposites(): void {
  registerComposite(smsExpressWrittenConsentRecordedPredicate);
}

registerAllSmsComposites();

export { smsExpressWrittenConsentRecordedPredicate };
