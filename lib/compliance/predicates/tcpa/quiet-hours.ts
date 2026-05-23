// TCPA quiet-hours composite predicate.
// 47 CFR 64.1200(c)(1): calls allowed 8 AM through 9 PM recipient local time.
// State regimes (Bubble 1b) intersect with federal — never preempt.
//
// Bright Data integration day will derive recipient_timezone from phone number via SERP.
// For Bubble 1a, recipient_timezone is required input.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import {
  FEDERAL_QUIET_HOURS,
  STATE_QUIET_HOURS,
  type QuietHoursWindow,
} from './quiet-hours-table';

interface QuietHoursInput {
  /** IANA timezone identifier (e.g., "America/New_York"). */
  recipient_timezone: string;
  /** Two-letter US state code. Optional; absent means federal only. */
  recipient_state?: string;
  /** ISO 8601 datetime. Defaults to ctx.now when omitted. */
  attempted_at?: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['recipient_timezone'],
  properties: {
    recipient_timezone: { type: 'string', minLength: 1 },
    recipient_state: { type: 'string', pattern: '^[A-Z]{2}$' },
    attempted_at: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'tcpa_quiet_hours_respected';

export const quietHoursPredicate: CompositePredicate<QuietHoursInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, ctx): Promise<CompositePredicateEvaluation> {
    const attemptedAt = input.attempted_at ? new Date(input.attempted_at) : ctx.now;
    if (isNaN(attemptedAt.getTime())) {
      return fail('invalid attempted_at datetime', { attempted_at: input.attempted_at });
    }

    const localTime = formatLocalTime(attemptedAt, input.recipient_timezone);
    if (!localTime) {
      return fail(`unknown or invalid IANA timezone: ${input.recipient_timezone}`, {
        recipient_timezone: input.recipient_timezone,
      });
    }

    const stateRegime = input.recipient_state
      ? STATE_QUIET_HOURS[input.recipient_state]
      : undefined;
    const effective = intersectWindows(
      stateRegime
        ? [FEDERAL_QUIET_HOURS.allowed_window, stateRegime.allowed_window]
        : [FEDERAL_QUIET_HOURS.allowed_window],
    );

    if (!effective) {
      return fail(
        'federal and state windows do not intersect (zero-duration effective window)',
        {
          recipient_local_time: localTime,
          federal_window: FEDERAL_QUIET_HOURS.allowed_window,
          state_window: stateRegime?.allowed_window,
        },
      );
    }

    const regimeLabel = stateRegime ? 'federal + state intersection' : 'federal only';
    const inside = isInWindow(localTime, effective);
    const details: Record<string, unknown> = {
      recipient_local_time: localTime,
      effective_window: effective,
      regime: regimeLabel,
    };
    if (input.recipient_state) details.recipient_state = input.recipient_state;

    if (inside) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `local time ${localTime} is within allowed window ${effective.start}-${effective.end}`,
        details,
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: `local time ${localTime} is outside allowed window ${effective.start}-${effective.end}`,
      details,
    };
  },
};

function fail(reason: string, details: Record<string, unknown>): CompositePredicateEvaluation {
  return { predicate: PREDICATE_NAME, result: 'fail', reason, details };
}

function formatLocalTime(when: Date, timezone: string): string | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(when);
    let hr = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const min = parts.find((p) => p.type === 'minute')?.value ?? '00';
    if (hr === '24') hr = '00';
    return `${hr.padStart(2, '0')}:${min.padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function isInWindow(time: string, window: QuietHoursWindow): boolean {
  if (window.start <= window.end) {
    return time >= window.start && time < window.end;
  }
  // Overnight wrap (e.g., 21:00-08:00). Match if time is on either side of midnight.
  return time >= window.start || time < window.end;
}

/**
 * Intersect a list of allowed windows. For Bubble 1a, this is either [federal] or
 * [federal, state]. Returns null if the intersection is empty (zero-duration).
 *
 * Non-overnight only for now: if any window wraps midnight, we conservatively fall
 * back to the federal window. Bubble 1b extends this when populated states require it.
 */
function intersectWindows(windows: QuietHoursWindow[]): QuietHoursWindow | null {
  if (windows.length === 0) return null;
  if (windows.length === 1) return windows[0];

  const allNonOvernight = windows.every((w) => w.start <= w.end);
  if (!allNonOvernight) {
    return windows[0];
  }

  const start = windows.reduce((s, w) => (w.start > s ? w.start : s), '00:00');
  const end = windows.reduce((e, w) => (w.end < e ? w.end : e), '23:59');

  if (start >= end) return null;
  return { start, end };
}
