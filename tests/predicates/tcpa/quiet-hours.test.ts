import { describe, it, expect, beforeEach } from 'vitest';
import { quietHoursPredicate } from '../../../lib/compliance/predicates/tcpa/quiet-hours';
import {
  registerComposite,
  validateCompositeInput,
  clearComposites,
} from '../../../lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(now: Date): EvalContext {
  return {
    now,
    tenant_id: 'tenant-test',
    agent_id: 'agent-test',
    request_id: 'req-test',
    audit: NULL_EMITTER,
  };
}

describe('TCPA quiet-hours predicate', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(quietHoursPredicate);
  });

  it('passes inside federal window (10 AM Eastern)', async () => {
    // 2026-05-21 14:00 UTC = 10:00 EDT
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-21T14:00:00Z')),
    );
    expect(result.result).toBe('pass');
    expect(result.details.recipient_local_time).toBe('10:00');
    expect(result.details.regime).toBe('federal only');
  });

  it('fails outside federal window (10 PM Eastern)', async () => {
    // 2026-05-22 02:00 UTC = 22:00 EDT
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-22T02:00:00Z')),
    );
    expect(result.result).toBe('fail');
    expect(result.details.recipient_local_time).toBe('22:00');
  });

  it('passes at the 8:00 AM boundary (inclusive lower)', async () => {
    // 2026-05-21 12:00 UTC = 08:00 EDT
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-21T12:00:00Z')),
    );
    expect(result.result).toBe('pass');
  });

  it('fails at the 9:00 PM boundary (exclusive upper)', async () => {
    // 2026-05-22 01:00 UTC = 21:00 EDT
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-22T01:00:00Z')),
    );
    expect(result.result).toBe('fail');
  });

  it('fails at midnight Eastern (dead center of quiet hours)', async () => {
    // 2026-05-22 04:00 UTC = 00:00 EDT
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-22T04:00:00Z')),
    );
    expect(result.result).toBe('fail');
    expect(result.details.recipient_local_time).toBe('00:00');
  });

  it('honors explicit IANA timezone (Phoenix has no DST)', async () => {
    // 2026-05-21 14:00 UTC = 10:00 EDT but 07:00 MST in Phoenix
    const eastern = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-21T14:00:00Z')),
    );
    const phoenix = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/Phoenix' },
      makeCtx(new Date('2026-05-21T14:00:00Z')),
    );
    expect(eastern.result).toBe('pass');
    expect(phoenix.result).toBe('fail');
    expect(phoenix.details.recipient_local_time).toBe('07:00');
  });

  it('DST spring-forward: 03:00 EDT on the second Sunday of March is pre-window', async () => {
    // 2026-03-08 07:00 UTC = 03:00 EDT (post-spring-forward)
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-03-08T07:00:00Z')),
    );
    expect(result.result).toBe('fail');
    expect(result.details.recipient_local_time).toBe('03:00');
  });

  it('DST fall-back: 01:30 on the first Sunday of November is pre-window', async () => {
    // 2026-11-01 06:30 UTC = 01:30 EST (post-fall-back)
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-11-01T06:30:00Z')),
    );
    expect(result.result).toBe('fail');
  });

  it('unknown recipient_state falls back to federal-only regime', async () => {
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York', recipient_state: 'GA' },
      makeCtx(new Date('2026-05-21T14:00:00Z')),
    );
    expect(result.result).toBe('pass');
    expect(result.details.regime).toBe('federal only');
  });

  it('returns explicit reason for unknown IANA timezone', async () => {
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'Not/A_Real_Timezone' },
      makeCtx(new Date('2026-05-21T14:00:00Z')),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/unknown or invalid IANA timezone/i);
  });

  it('Ajv rejects input missing recipient_timezone', () => {
    const validation = validateCompositeInput(quietHoursPredicate.name, {});
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('Ajv rejects recipient_state that is not 2-letter uppercase', () => {
    const validation = validateCompositeInput(quietHoursPredicate.name, {
      recipient_timezone: 'America/New_York',
      recipient_state: 'georgia',
    });
    expect(validation.valid).toBe(false);
  });

  it('details.recipient_local_time matches the Intl-formatted local time', async () => {
    // 2026-05-21 15:30 UTC = 11:30 EDT
    const result = await quietHoursPredicate.evaluate(
      { recipient_timezone: 'America/New_York' },
      makeCtx(new Date('2026-05-21T15:30:00Z')),
    );
    expect(result.details.recipient_local_time).toBe('11:30');
  });
});
