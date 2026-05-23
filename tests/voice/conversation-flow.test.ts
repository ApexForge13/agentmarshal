import { describe, it, expect, beforeEach } from 'vitest';
import demoFlow from '../../data/voice/demo-flow.json';
import {
  nextUtterance,
  recoveryUtterance,
  CONTRACTOR_NAME,
} from '../../lib/voice/conversation-flow';
import { clearCallStates, getOrCreateCallState } from '../../lib/voice/call-state';
import type { CallPhase, ConversationTurn } from '../../lib/voice/types';

const PHASES = (demoFlow as { phases: Record<CallPhase, string[]> }).phases;

function stateInPhase(phase: CallPhase, transcript: ConversationTurn[] = []) {
  const s = getOrCreateCallState(`call-${phase}-${Math.random()}`);
  s.phase = phase;
  s.transcript = transcript;
  return s;
}

describe('voice conversation-flow', () => {
  beforeEach(() => clearCallStates());

  it('returns an utterance from the bank for each phase', () => {
    for (const phase of Object.keys(PHASES) as CallPhase[]) {
      const sel = nextUtterance(stateInPhase(phase));
      expect(sel.phase).toBe(phase);
      expect(PHASES[phase]).toContain(sel.text);
    }
  });

  it('greeting phase returns a greeting line', () => {
    const sel = nextUtterance(stateInPhase('greeting'));
    expect(PHASES.greeting).toContain(sel.text);
    expect(sel.end_call).toBe(false);
  });

  it('walks the capturing bank by number of caller answers collected', () => {
    const caller = (text: string): ConversationTurn => ({ role: 'caller', text, at: '' });
    const first = nextUtterance(stateInPhase('capturing', [caller('hi there')]));
    const second = nextUtterance(stateInPhase('capturing', [caller('a'), caller('b')]));
    expect(first.text).toBe(PHASES.capturing[0]);
    expect(second.text).toBe(PHASES.capturing[1]);
  });

  it('close phase queues escalate_to_human and ends the call (triage hand-off)', () => {
    const sel = nextUtterance(stateInPhase('close'));
    expect(sel.queue_actions).toContain('escalate_to_human');
    expect(sel.end_call).toBe(true);
    expect(sel.text).toContain(CONTRACTOR_NAME);
  });

  it('recoveryUtterance returns a recovery-after-deny line and does not end the call', () => {
    const sel = recoveryUtterance(stateInPhase('recovery_after_deny'));
    expect(sel.phase).toBe('recovery_after_deny');
    expect(PHASES.recovery_after_deny).toContain(sel.text);
    expect(sel.end_call).toBe(false);
  });
});
