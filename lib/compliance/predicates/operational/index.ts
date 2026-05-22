// Registers all 7 operational composite predicates (3 operational + 4 pipeline control).
// Side-effect import populates the registry; explicit registerAllOperationalComposites()
// is exported for test setup (clearComposites + re-register) and grep-ability
// (so tree-shake or rename-refactors surface the registration call site).

import { registerComposite } from '@/lib/authzen/composite-dispatch';
import { senderReputationAboveThresholdPredicate } from './sender-reputation-above-threshold';
import { bounceRateCompliantPredicate } from './bounce-rate-compliant';
import { complaintRateCompliantPredicate } from './complaint-rate-compliant';
import { inboxSendCapacityAboveFloorPredicate } from './inbox-send-capacity-above-floor';
import { pipelineBufferWithinTargetBandPredicate } from './pipeline-buffer-within-target-band';
import { pullRateCalibratedToSendRatePredicate } from './pull-rate-calibrated-to-send-rate';
import { scrapeBudgetWithinMonthlyCapPredicate } from './scrape-budget-within-monthly-cap';

export function registerAllOperationalComposites(): void {
  registerComposite(senderReputationAboveThresholdPredicate);
  registerComposite(bounceRateCompliantPredicate);
  registerComposite(complaintRateCompliantPredicate);
  registerComposite(inboxSendCapacityAboveFloorPredicate);
  registerComposite(pipelineBufferWithinTargetBandPredicate);
  registerComposite(pullRateCalibratedToSendRatePredicate);
  registerComposite(scrapeBudgetWithinMonthlyCapPredicate);
}

registerAllOperationalComposites();

export {
  senderReputationAboveThresholdPredicate,
  bounceRateCompliantPredicate,
  complaintRateCompliantPredicate,
  inboxSendCapacityAboveFloorPredicate,
  pipelineBufferWithinTargetBandPredicate,
  pullRateCalibratedToSendRatePredicate,
  scrapeBudgetWithinMonthlyCapPredicate,
};
