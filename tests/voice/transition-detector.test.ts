import { describe, it, expect } from 'vitest';
import { detectTransition } from '../../lib/voice/transition-detector';

describe('voice transition-detector', () => {
  it('detects consent_revoked across the keyword set', () => {
    const cases = [
      'hey, stop recording me',
      "don't record this call",
      'do not record me please',
      'take me off your list',
      'please remove me',
      'I want off your list',
    ];
    for (const utt of cases) {
      const t = detectTransition(utt);
      expect(t, `"${utt}" should revoke`).not.toBeNull();
      expect(t?.type).toBe('consent_revoked');
    }
  });

  it('detects consent_granted', () => {
    expect(detectTransition('yes you can record this')?.type).toBe('consent_granted');
    expect(detectTransition('go ahead and record')?.type).toBe('consent_granted');
    expect(detectTransition("that's fine to record")?.type).toBe('consent_granted');
  });

  it('detects caller_ending', () => {
    expect(detectTransition('okay goodbye')?.type).toBe('caller_ending');
    expect(detectTransition('bye now')?.type).toBe('caller_ending');
    expect(detectTransition('I gotta go')?.type).toBe('caller_ending');
    expect(detectTransition('I have to go, sorry')?.type).toBe('caller_ending');
  });

  it('does NOT false-positive consent_revoked on benign "recording" mentions', () => {
    // The bug that would tank the demo: tight matching, not bare "record".
    expect(detectTransition("I'm recording this for myself")).toBeNull();
    expect(detectTransition('can you record the appointment details')).toBeNull();
    expect(detectTransition('my address is 100 Record Street')).toBeNull();
    expect(detectTransition('the storm damage is on the north side')).toBeNull();
  });

  it('returns null for empty / whitespace input', () => {
    expect(detectTransition('')).toBeNull();
    expect(detectTransition('   ')).toBeNull();
  });

  it('returns the matched phrase and original utterance for audit', () => {
    const t = detectTransition('please STOP RECORDING now');
    expect(t?.matched.toLowerCase()).toBe('stop recording');
    expect(t?.utterance).toBe('please STOP RECORDING now');
  });
});
