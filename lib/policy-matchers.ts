// Match operators used by the policy engine. Each matcher is a pure function
// of (actual, expected) → boolean. `regex` and `not_matches` swallow invalid
// patterns and return false rather than throwing, so a malformed rule can't
// take down the whole evaluation.

export type Op =
  | 'exact'
  | 'contains'
  | 'regex'
  | 'boolean'
  | 'threshold'
  | 'less_than'
  | 'greater_than'
  | 'not_matches';

export type Matcher = (actual: unknown, expected: unknown) => boolean;

export const exact: Matcher = (actual, expected) => actual === expected;

export const contains: Matcher = (actual, expected) => {
  if (typeof actual === 'string') {
    return actual.includes(String(expected));
  }
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }
  return false;
};

export const regex: Matcher = (actual, expected) => {
  if (typeof actual !== 'string') return false;
  try {
    return new RegExp(String(expected)).test(actual);
  } catch {
    return false;
  }
};

export const boolean: Matcher = (actual, expected) =>
  Boolean(actual) === Boolean(expected);

export const threshold: Matcher = (actual, expected) =>
  Number(actual) >= Number(expected);

export const less_than: Matcher = (actual, expected) =>
  Number(actual) < Number(expected);

export const greater_than: Matcher = (actual, expected) =>
  Number(actual) > Number(expected);

export const not_matches: Matcher = (actual, expected) => {
  if (typeof actual !== 'string') return true;
  try {
    return !new RegExp(String(expected)).test(actual);
  } catch {
    return false;
  }
};

export const MATCHERS: Record<Op, Matcher> = {
  exact,
  contains,
  regex,
  boolean,
  threshold,
  less_than,
  greater_than,
  not_matches,
};
