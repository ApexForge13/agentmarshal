// Shared pipeline used by both the demo HTTP routes and the smoke scripts:
// load policy → pick scenario → LT inspect → evaluate → append → return.
//
// Throws if the scenario is missing required fields. Errors from inspect()
// (LT unreachable, non-JSON body) propagate unchanged — callers decide HTTP
// status mapping or CLI exit behavior.

import path from 'node:path';

import { append } from '@/lib/audit-log';
import {
  evaluate,
  loadPolicy,
  type EvaluateInput,
} from '@/lib/policy-engine';
import { inspect } from '@/lib/lobstertrap-client';
import { SCENARIOS, type ScenarioKind } from '@/lib/agents/scenarios';
import type { LobsterTrapMetadata, PolicyDecision } from '@/types';

export interface ScenarioRunResult {
  scenarioId: ScenarioKind;
  decision: PolicyDecision;
  auditId: number;
  // Surfaced so smoke scripts can reproduce their original LT line. Routes
  // serialize this through to the dashboard anyway via the JSON response.
  lobsterTrapMetadata: LobsterTrapMetadata;
}

export async function runScenario(
  scenarioId: ScenarioKind,
): Promise<ScenarioRunResult> {
  const policyPath = path.resolve(process.cwd(), 'configs', 'policy.yaml');
  const policy = loadPolicy(policyPath);

  const scenario = SCENARIOS[scenarioId];
  if (
    !scenario.rawInput ||
    !scenario.agentId ||
    !scenario.declaredScope ||
    !scenario.declaredIntent ||
    !scenario.attemptedAction
  ) {
    throw new Error(`Scenario ${scenarioId} missing required fields`);
  }

  const rawInput = scenario.rawInput;
  const agentmarshalContext = scenario.agentmarshalContext ?? {};

  const ltMetadata = await inspect(rawInput);

  const input: EvaluateInput = {
    agentId: scenario.agentId,
    declaredScope: scenario.declaredScope,
    declaredIntent: scenario.declaredIntent,
    attemptedAction: scenario.attemptedAction,
    lobsterTrapMetadata: ltMetadata,
    agentmarshalContext,
  };
  const decision = evaluate(policy, input);

  const dollarImpact =
    typeof agentmarshalContext.dollar_impact === 'number'
      ? agentmarshalContext.dollar_impact
      : undefined;

  const auditId = append({
    action: decision.action,
    rulesFired: decision.rulesFired,
    declaredScope: decision.declaredScope,
    declaredIntent: decision.declaredIntent,
    detectedIntent: decision.detectedIntent,
    metadata: decision.metadata,
    agentId: scenario.agentId,
    attemptedAction: scenario.attemptedAction,
    lobsterTrapMetadata: ltMetadata,
    agentmarshalContext,
    rawInput,
    dollarImpact,
  });

  return { scenarioId, decision, auditId, lobsterTrapMetadata: ltMetadata };
}
