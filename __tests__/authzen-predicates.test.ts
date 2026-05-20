import { describe, it, expect } from 'vitest';
import { evaluatePredicate } from '../lib/authzen/predicates';
import type { TimeWindowConstraint } from '../types/authzen';

describe('evaluatePredicate — literal equality', () => {
  it('passes when string literal equals actual', () => {
    expect(evaluatePredicate('send_email', 'send_email').result).toBe('pass');
  });
  it('fails when string literal differs from actual', () => {
    expect(evaluatePredicate('send_email', 'place_call').result).toBe('fail');
  });
  it('passes when number literal equals actual', () => {
    expect(evaluatePredicate(42, 42).result).toBe('pass');
  });
  it('passes when boolean literal equals actual', () => {
    expect(evaluatePredicate(true, true).result).toBe('pass');
  });
  it('passes when null literal matches null actual', () => {
    expect(evaluatePredicate(null, null).result).toBe('pass');
  });
});

describe('evaluatePredicate — equals/not_equals', () => {
  it('equals passes on match', () => {
    expect(evaluatePredicate({ equals: 'GA' }, 'GA').result).toBe('pass');
  });
  it('equals fails on mismatch', () => {
    expect(evaluatePredicate({ equals: 'GA' }, 'CA').result).toBe('fail');
  });
  it('not_equals passes when values differ', () => {
    expect(evaluatePredicate({ not_equals: 'CA' }, 'GA').result).toBe('pass');
  });
  it('not_equals fails when values match', () => {
    expect(evaluatePredicate({ not_equals: 'GA' }, 'GA').result).toBe('fail');
  });
});

describe('evaluatePredicate — in/not_in', () => {
  it('in passes when value is in set', () => {
    expect(evaluatePredicate({ in: ['GA', 'NC', 'CO'] }, 'NC').result).toBe('pass');
  });
  it('in fails when value is outside set', () => {
    expect(evaluatePredicate({ in: ['GA', 'NC', 'CO'] }, 'FL').result).toBe('fail');
  });
  it('not_in passes when value is outside disallowed set', () => {
    expect(evaluatePredicate({ not_in: ['FL', 'CA', 'NY'] }, 'GA').result).toBe('pass');
  });
  it('not_in fails when value is in disallowed set', () => {
    expect(evaluatePredicate({ not_in: ['FL', 'CA', 'NY'] }, 'CA').result).toBe('fail');
  });
});

describe('evaluatePredicate — pattern (regex)', () => {
  it('passes on regex match', () => {
    expect(evaluatePredicate({ pattern: '^lead-\\d+$' }, 'lead-20189').result).toBe('pass');
  });
  it('fails on regex non-match', () => {
    expect(evaluatePredicate({ pattern: '^lead-\\d+$' }, 'lead-abc').result).toBe('fail');
  });
  it('fails when value is not a string', () => {
    expect(evaluatePredicate({ pattern: '^lead-\\d+$' }, 12345).result).toBe('fail');
  });
});

describe('evaluatePredicate — min/max/between (numeric)', () => {
  it('min passes when value >= bound', () => {
    expect(evaluatePredicate({ min: 100 }, 100).result).toBe('pass');
    expect(evaluatePredicate({ min: 100 }, 150).result).toBe('pass');
  });
  it('min fails when value < bound', () => {
    expect(evaluatePredicate({ min: 100 }, 99).result).toBe('fail');
  });
  it('max passes when value <= bound', () => {
    expect(evaluatePredicate({ max: 1000 }, 1000).result).toBe('pass');
    expect(evaluatePredicate({ max: 1000 }, 500).result).toBe('pass');
  });
  it('max fails when value > bound', () => {
    expect(evaluatePredicate({ max: 1000 }, 1001).result).toBe('fail');
  });
  it('between passes when value is in [low, high] inclusive', () => {
    expect(evaluatePredicate({ between: [10, 20] }, 10).result).toBe('pass');
    expect(evaluatePredicate({ between: [10, 20] }, 15).result).toBe('pass');
    expect(evaluatePredicate({ between: [10, 20] }, 20).result).toBe('pass');
  });
  it('between fails when value is outside range', () => {
    expect(evaluatePredicate({ between: [10, 20] }, 9).result).toBe('fail');
    expect(evaluatePredicate({ between: [10, 20] }, 21).result).toBe('fail');
  });
  it('multiple numeric ops compose as AND', () => {
    expect(evaluatePredicate({ min: 10, max: 20 }, 15).result).toBe('pass');
    expect(evaluatePredicate({ min: 10, max: 20 }, 5).result).toBe('fail');
    expect(evaluatePredicate({ min: 10, max: 20 }, 25).result).toBe('fail');
  });
});

describe('evaluatePredicate — before/after (datetime)', () => {
  it('before passes when value is earlier than bound', () => {
    expect(evaluatePredicate({ before: '2026-05-21T12:00:00Z' }, '2026-05-21T10:00:00Z').result).toBe('pass');
  });
  it('before fails when value is at or after bound', () => {
    expect(evaluatePredicate({ before: '2026-05-21T12:00:00Z' }, '2026-05-21T12:00:00Z').result).toBe('fail');
    expect(evaluatePredicate({ before: '2026-05-21T12:00:00Z' }, '2026-05-21T14:00:00Z').result).toBe('fail');
  });
  it('after passes when value is later than bound', () => {
    expect(evaluatePredicate({ after: '2026-05-21T12:00:00Z' }, '2026-05-21T14:00:00Z').result).toBe('pass');
  });
  it('after fails when value is at or before bound', () => {
    expect(evaluatePredicate({ after: '2026-05-21T12:00:00Z' }, '2026-05-21T12:00:00Z').result).toBe('fail');
    expect(evaluatePredicate({ after: '2026-05-21T12:00:00Z' }, '2026-05-21T10:00:00Z').result).toBe('fail');
  });
});

describe('evaluatePredicate — currency modifier with numeric ops', () => {
  it('passes when currency matches and amount within bound', () => {
    expect(evaluatePredicate(
      { currency: 'USD', max: 1000 },
      { amount: 500, currency: 'USD' }
    ).result).toBe('pass');
  });
  it('fails when currency mismatches (no conversion)', () => {
    const r = evaluatePredicate(
      { currency: 'USD', max: 1000 },
      { amount: 500, currency: 'EUR' }
    );
    expect(r.result).toBe('fail');
    expect(r.reason).toMatch(/currency mismatch/i);
  });
  it('fails when amount exceeds max despite currency match', () => {
    expect(evaluatePredicate(
      { currency: 'USD', max: 1000 },
      { amount: 1500, currency: 'USD' }
    ).result).toBe('fail');
  });
  it('currency alone (no numeric op) acts as currency-only assertion', () => {
    expect(evaluatePredicate(
      { currency: 'USD' },
      { amount: 500, currency: 'USD' }
    ).result).toBe('pass');
    expect(evaluatePredicate(
      { currency: 'USD' },
      { amount: 500, currency: 'EUR' }
    ).result).toBe('fail');
  });
  it('fails when actualValue is not a monetary object', () => {
    expect(evaluatePredicate(
      { currency: 'USD', max: 1000 },
      500
    ).result).toBe('fail');
  });
});

describe('evaluatePredicate — exists/not_exists', () => {
  it('exists: true passes when value is present', () => {
    expect(evaluatePredicate({ exists: true }, 'anything').result).toBe('pass');
    expect(evaluatePredicate({ exists: true }, 0).result).toBe('pass');
    expect(evaluatePredicate({ exists: true }, false).result).toBe('pass');
  });
  it('exists: true fails when value is null or undefined', () => {
    expect(evaluatePredicate({ exists: true }, null).result).toBe('fail');
    expect(evaluatePredicate({ exists: true }, undefined).result).toBe('fail');
  });
  it('exists: false passes when value is null or undefined', () => {
    expect(evaluatePredicate({ exists: false }, null).result).toBe('pass');
    expect(evaluatePredicate({ exists: false }, undefined).result).toBe('pass');
  });
  it('exists: false fails when value is present', () => {
    expect(evaluatePredicate({ exists: false }, 'something').result).toBe('fail');
  });
  it('not_exists: true behaves like exists: false', () => {
    expect(evaluatePredicate({ not_exists: true }, null).result).toBe('pass');
    expect(evaluatePredicate({ not_exists: true }, 'present').result).toBe('fail');
  });
});

describe('evaluatePredicate — implicit presence requirement', () => {
  it('non-exists operator on null value implicitly fails', () => {
    expect(evaluatePredicate({ equals: 'GA' }, null).result).toBe('fail');
    expect(evaluatePredicate({ in: ['GA'] }, undefined).result).toBe('fail');
    expect(evaluatePredicate({ min: 100 }, null).result).toBe('fail');
  });
});

describe('evaluatePredicate — time_window (TCPA quiet hours analog)', () => {
  const easternBusinessHours: TimeWindowConstraint = {
    timezone: 'America/New_York',
    windows: [
      { start: '09:00', end: '17:00', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    ],
  };

  it('passes during business hours weekday', () => {
    const wedNoonEastern = new Date('2026-05-20T16:00:00Z'); // 12:00 EDT Wed
    const r = evaluatePredicate({ time_window: easternBusinessHours }, 'irrelevant', { now: wedNoonEastern });
    expect(r.result).toBe('pass');
  });

  it('fails outside business hours weekday', () => {
    const wed10pmEastern = new Date('2026-05-21T02:00:00Z'); // 22:00 EDT Wed
    const r = evaluatePredicate({ time_window: easternBusinessHours }, 'irrelevant', { now: wed10pmEastern });
    expect(r.result).toBe('fail');
  });

  it('fails on weekend even within time range', () => {
    const satNoonEastern = new Date('2026-05-23T16:00:00Z'); // 12:00 EDT Sat
    const r = evaluatePredicate({ time_window: easternBusinessHours }, 'irrelevant', { now: satNoonEastern });
    expect(r.result).toBe('fail');
  });

  it('overnight window wraps midnight correctly', () => {
    const overnightQuiet = {
      timezone: 'America/New_York',
      windows: [{ start: '21:00', end: '08:00' }],
    };
    // 23:00 EDT Tue — should be in window
    const lateNight = new Date('2026-05-21T03:00:00Z');
    expect(evaluatePredicate({ time_window: overnightQuiet }, 'x', { now: lateNight }).result).toBe('pass');
    // 06:00 EDT Wed — also in window (other side of midnight)
    const earlyMorning = new Date('2026-05-21T10:00:00Z');
    expect(evaluatePredicate({ time_window: overnightQuiet }, 'x', { now: earlyMorning }).result).toBe('pass');
    // 12:00 EDT — outside window
    const midday = new Date('2026-05-21T16:00:00Z');
    expect(evaluatePredicate({ time_window: overnightQuiet }, 'x', { now: midday }).result).toBe('fail');
  });
});

describe('evaluatePredicate — multiple operators implicit AND', () => {
  it('passes only when all operators hold', () => {
    expect(evaluatePredicate(
      { in: ['GA', 'NC', 'CO'], not_equals: 'CO' },
      'GA'
    ).result).toBe('pass');
    expect(evaluatePredicate(
      { in: ['GA', 'NC', 'CO'], not_equals: 'CO' },
      'CO'
    ).result).toBe('fail');
    expect(evaluatePredicate(
      { in: ['GA', 'NC', 'CO'], not_equals: 'CO' },
      'FL'
    ).result).toBe('fail');
  });
});
