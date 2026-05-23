// Scripted demo conversation flow (Bubble 9).
//
// SAMPLE AGENT — demo-grade. Given a CallState, return the next agent
// utterance from the scripted bank in data/voice/demo-flow.json. This is NOT
// production dialogue management; production (echo-os) drives turns from the
// custom LLM. Scope is intentionally narrow: triage + escalation, no
// qualification logic and no appointment booking.

import demoFlow from '@/data/voice/demo-flow.json';
import type { CallState, CallPhase } from './types';

interface DemoFlow {
  contractor_name: string;
  phases: Record<CallPhase, string[]>;
}

const FLOW = demoFlow as unknown as DemoFlow;

export const CONTRACTOR_NAME = FLOW.contractor_name;

export interface UtteranceSelection {
  phase: CallPhase;
  text: string;
  /** Actions to queue as a side effect of reaching this phase (e.g. close → escalate). */
  queue_actions: string[];
  /** Whether the agent should end the call after this utterance. */
  end_call: boolean;
}

function bankFor(phase: CallPhase): string[] {
  const bank = FLOW.phases[phase];
  return bank && bank.length > 0 ? bank : ['One moment.'];
}

/** Count agent turns already delivered, used to advance through a phase bank. */
function agentTurnCount(state: CallState): number {
  return state.transcript.filter((t) => t.role === 'agent').length;
}

/**
 * Select the next agent utterance for the call's current phase. Deterministic:
 * within a phase, advances through the scripted bank by the number of caller
 * turns seen, clamped to the last line. The `close` phase queues
 * escalate_to_human (triage hand-off — the Voice agent never closes a deal).
 */
export function nextUtterance(state: CallState): UtteranceSelection {
  const phase = state.phase;
  const bank = bankFor(phase);

  // Advance within capturing by how many caller answers we've collected so we
  // walk name → address → damage-type rather than repeating the first prompt.
  const callerTurns = state.transcript.filter((t) => t.role === 'caller').length;
  const idx =
    phase === 'capturing'
      ? Math.min(Math.max(callerTurns - 1, 0), bank.length - 1)
      : agentTurnCount(state) % bank.length;

  const queue_actions = phase === 'close' ? ['escalate_to_human'] : [];

  return {
    phase,
    text: bank[idx],
    queue_actions,
    end_call: phase === 'close',
  };
}

/** The recovery utterance to deliver immediately after a denied record_call. */
export function recoveryUtterance(state: CallState): UtteranceSelection {
  const bank = bankFor('recovery_after_deny');
  const idx = agentTurnCount(state) % bank.length;
  return {
    phase: 'recovery_after_deny',
    text: bank[idx],
    queue_actions: [],
    end_call: false,
  };
}
