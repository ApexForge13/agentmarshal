// Predicate operator implementations for Scope Contract evaluation.
// Implements all 13 base operators from scope-contract.schema.json + currency modifier.
// Pure functions. No I/O. Time-dependent operators accept now via PredicateContext.

import type {
  PredicateConstraint,
  PredicateOperators,
  TimeWindowConstraint,
  PredicateContext,
  PredicateOutcome,
} from '@/types/authzen';

const WEEKDAY_MAP: Record<string, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
  Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
};

/**
 * Evaluate a single predicate constraint against an actual value.
 * - Literal forms (string/number/boolean/null) = strict equality.
 * - Object form = all present operators must hold (implicit AND).
 * - Currency is a modifier: when present, actualValue MUST be `{ amount, currency }`.
 *   Currency mismatch fails; no conversion. Numeric ops then apply to .amount.
 */
export function evaluatePredicate(
  constraint: PredicateConstraint,
  actualValue: unknown,
  context: PredicateContext = {}
): PredicateOutcome {
  // Literal forms = exact equality
  if (
    typeof constraint === 'string' ||
    typeof constraint === 'number' ||
    typeof constraint === 'boolean' ||
    constraint === null
  ) {
    return evalEquals(constraint, actualValue);
  }

  if (typeof constraint !== 'object') {
    return { result: 'fail', reason: 'invalid predicate constraint type' };
  }

  const ops = constraint as PredicateOperators;

  // exists / not_exists handled first (short-circuit on absence semantics)
  if (ops.exists !== undefined) {
    const present = actualValue !== null && actualValue !== undefined;
    if (ops.exists && !present) return { result: 'fail', reason: 'property absent' };
    if (!ops.exists && present) return { result: 'fail', reason: 'property present' };
  }
  if (ops.not_exists !== undefined) {
    const present = actualValue !== null && actualValue !== undefined;
    if (ops.not_exists && present) return { result: 'fail', reason: 'property present' };
    if (!ops.not_exists && !present) return { result: 'fail', reason: 'property absent' };
  }

  // Per schema: non-exists operators IMPLICITLY require property presence
  const hasNonExistsOp =
    ops.equals !== undefined ||
    ops.not_equals !== undefined ||
    ops.in !== undefined ||
    ops.not_in !== undefined ||
    ops.pattern !== undefined ||
    ops.min !== undefined ||
    ops.max !== undefined ||
    ops.between !== undefined ||
    ops.before !== undefined ||
    ops.after !== undefined ||
    ops.time_window !== undefined ||
    ops.currency !== undefined;

  if (hasNonExistsOp && (actualValue === null || actualValue === undefined)) {
    return { result: 'fail', reason: 'property absent' };
  }

  // Currency modifier: when present, actualValue must be `{ amount, currency }`,
  // currency must match, and subsequent numeric ops apply to .amount.
  let valueForNumeric: number | undefined;
  let valueForGeneral: unknown = actualValue;

  if (ops.currency !== undefined) {
    if (
      typeof actualValue !== 'object' ||
      actualValue === null ||
      !('amount' in actualValue) ||
      !('currency' in actualValue)
    ) {
      return { result: 'fail', reason: 'monetary value expected (object with amount + currency)' };
    }
    const obj = actualValue as { amount: unknown; currency: unknown };
    if (typeof obj.currency !== 'string' || obj.currency !== ops.currency) {
      return {
        result: 'fail',
        reason: `currency mismatch: predicate=${ops.currency} actual=${String(obj.currency)}`,
      };
    }
    if (typeof obj.amount !== 'number') {
      return { result: 'fail', reason: 'monetary amount not a number' };
    }
    valueForNumeric = obj.amount;
    valueForGeneral = obj.amount;
  } else if (typeof actualValue === 'number') {
    valueForNumeric = actualValue;
  }

  // equals
  if (ops.equals !== undefined) {
    const cmp = evalEquals(ops.equals, valueForGeneral);
    if (cmp.result === 'fail') return cmp;
  }

  // not_equals
  if (ops.not_equals !== undefined) {
    if (deepEqual(ops.not_equals, valueForGeneral)) {
      return { result: 'fail', reason: 'value equals not_equals predicate' };
    }
  }

  // in
  if (ops.in !== undefined) {
    if (!Array.isArray(ops.in)) return { result: 'fail', reason: 'in operator requires array' };
    if (!ops.in.some(v => deepEqual(v, valueForGeneral))) {
      return { result: 'fail', reason: 'value not in allowed set' };
    }
  }

  // not_in
  if (ops.not_in !== undefined) {
    if (!Array.isArray(ops.not_in)) return { result: 'fail', reason: 'not_in operator requires array' };
    if (ops.not_in.some(v => deepEqual(v, valueForGeneral))) {
      return { result: 'fail', reason: 'value in disallowed set' };
    }
  }

  // pattern (regex, ECMA 262)
  if (ops.pattern !== undefined) {
    if (typeof valueForGeneral !== 'string') {
      return { result: 'fail', reason: 'pattern operator requires string value' };
    }
    let re: RegExp;
    try {
      re = new RegExp(ops.pattern);
    } catch {
      return { result: 'fail', reason: 'invalid regex pattern' };
    }
    if (!re.test(valueForGeneral)) {
      return { result: 'fail', reason: `value does not match pattern ${ops.pattern}` };
    }
  }

  // min / max / between — numeric
  if (ops.min !== undefined) {
    if (valueForNumeric === undefined) return { result: 'fail', reason: 'min requires numeric value' };
    if (valueForNumeric < ops.min) {
      return { result: 'fail', reason: `value ${valueForNumeric} below min ${ops.min}` };
    }
  }
  if (ops.max !== undefined) {
    if (valueForNumeric === undefined) return { result: 'fail', reason: 'max requires numeric value' };
    if (valueForNumeric > ops.max) {
      return { result: 'fail', reason: `value ${valueForNumeric} above max ${ops.max}` };
    }
  }
  if (ops.between !== undefined) {
    if (valueForNumeric === undefined) return { result: 'fail', reason: 'between requires numeric value' };
    if (!Array.isArray(ops.between) || ops.between.length !== 2) {
      return { result: 'fail', reason: 'between requires [low, high] array' };
    }
    const [low, high] = ops.between;
    if (valueForNumeric < low || valueForNumeric > high) {
      return { result: 'fail', reason: `value ${valueForNumeric} outside range [${low}, ${high}]` };
    }
  }

  // before / after — datetime
  if (ops.before !== undefined) {
    if (typeof valueForGeneral !== 'string') {
      return { result: 'fail', reason: 'before requires datetime string value' };
    }
    const val = new Date(valueForGeneral);
    const bound = new Date(ops.before);
    if (isNaN(val.getTime())) return { result: 'fail', reason: 'invalid actual datetime' };
    if (isNaN(bound.getTime())) return { result: 'fail', reason: 'invalid before bound' };
    if (val >= bound) return { result: 'fail', reason: `value ${valueForGeneral} not before ${ops.before}` };
  }
  if (ops.after !== undefined) {
    if (typeof valueForGeneral !== 'string') {
      return { result: 'fail', reason: 'after requires datetime string value' };
    }
    const val = new Date(valueForGeneral);
    const bound = new Date(ops.after);
    if (isNaN(val.getTime())) return { result: 'fail', reason: 'invalid actual datetime' };
    if (isNaN(bound.getTime())) return { result: 'fail', reason: 'invalid after bound' };
    if (val <= bound) return { result: 'fail', reason: `value ${valueForGeneral} not after ${ops.after}` };
  }

  // time_window — wall-clock window in predicate's timezone
  if (ops.time_window !== undefined) {
    const now = context.now ?? new Date();
    if (!isInTimeWindow(now, ops.time_window)) {
      return { result: 'fail', reason: 'current time outside time_window' };
    }
  }

  return { result: 'pass' };
}

function evalEquals(constraint: unknown, actualValue: unknown): PredicateOutcome {
  if (deepEqual(constraint, actualValue)) return { result: 'pass' };
  return { result: 'fail', reason: `value does not equal ${JSON.stringify(constraint)}` };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.length !== bk.length) return false;
    if (!ak.every((k, i) => k === bk[i])) return false;
    return ak.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/**
 * Check whether `now` falls within any of the time_window's windows in the predicate's timezone.
 * Supports overnight windows (start > end wraps midnight).
 * Per Issue 5 of schema verification: documented overnight handling.
 */
function isInTimeWindow(now: Date, window: TimeWindowConstraint): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: window.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  let hr = parts.find(p => p.type === 'hour')?.value ?? '00';
  const min = parts.find(p => p.type === 'minute')?.value ?? '00';
  // Intl formatters can return "24" for midnight in some locales; normalize to "00"
  if (hr === '24') hr = '00';
  const currentTime = `${hr.padStart(2, '0')}:${min.padStart(2, '0')}`;
  const currentWeekday = WEEKDAY_MAP[wd] ?? 'mon';

  for (const w of window.windows) {
    if (w.weekdays && !w.weekdays.includes(currentWeekday)) continue;

    if (w.start <= w.end) {
      // Single-day window
      if (currentTime >= w.start && currentTime <= w.end) return true;
    } else {
      // Overnight: wraps midnight (e.g., 22:00 → 06:00). Match if t >= start OR t <= end.
      if (currentTime >= w.start || currentTime <= w.end) return true;
    }
  }
  return false;
}
