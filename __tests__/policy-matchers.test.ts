import { describe, it, expect } from 'vitest';

import {
  MATCHERS,
  exact,
  contains,
  regex,
  boolean,
  threshold,
  less_than,
  greater_than,
  not_matches,
} from '../lib/policy-matchers';

describe('exact', () => {
  it('returns true for strict equality', () => {
    expect(exact('scheduling', 'scheduling')).toBe(true);
    expect(exact(7, 7)).toBe(true);
    expect(exact(true, true)).toBe(true);
  });

  it('does not coerce types', () => {
    expect(exact(1, '1')).toBe(false);
    expect(exact(0, false)).toBe(false);
  });
});

describe('contains', () => {
  it('matches substring inside a string', () => {
    expect(contains('contains_injection_patterns', 'injection')).toBe(true);
    expect(contains('hello world', 'xyz')).toBe(false);
  });

  it('matches element inside an array', () => {
    expect(contains(['a.com', 'b.com'], 'b.com')).toBe(true);
    expect(contains(['a.com', 'b.com'], 'c.com')).toBe(false);
  });

  it('returns false for unsupported types', () => {
    expect(contains(42, 4)).toBe(false);
    expect(contains(null, 'x')).toBe(false);
  });
});

describe('regex', () => {
  it('tests pattern against actual string', () => {
    expect(regex('rm -rf /', '^rm\\s+-rf')).toBe(true);
    expect(regex('safe command', '^rm')).toBe(false);
  });

  it('returns false for invalid pattern (no throw)', () => {
    expect(() => regex('anything', '[invalid(')).not.toThrow();
    expect(regex('anything', '[invalid(')).toBe(false);
  });

  it('returns false if actual is not a string', () => {
    expect(regex(123, '^1')).toBe(false);
  });
});

describe('boolean', () => {
  it('coerces both sides with Boolean()', () => {
    expect(boolean(true, true)).toBe(true);
    expect(boolean(1, true)).toBe(true);
    expect(boolean(0, false)).toBe(true);
    expect(boolean('non-empty', true)).toBe(true);
  });

  it('returns false when coerced values disagree', () => {
    expect(boolean(true, false)).toBe(false);
    expect(boolean('', true)).toBe(false);
  });
});

describe('threshold', () => {
  it('is true at or above the boundary (inclusive)', () => {
    expect(threshold(0.7, 0.7)).toBe(true);
    expect(threshold(0.8, 0.7)).toBe(true);
  });

  it('is false below the boundary', () => {
    expect(threshold(0.69, 0.7)).toBe(false);
  });
});

describe('less_than', () => {
  it('is strictly less', () => {
    expect(less_than(0.28, 0.35)).toBe(true);
    expect(less_than(0.35, 0.35)).toBe(false);
    expect(less_than(0.4, 0.35)).toBe(false);
  });
});

describe('greater_than', () => {
  it('is strictly greater', () => {
    expect(greater_than(0.83, 0.7)).toBe(true);
    expect(greater_than(0.7, 0.7)).toBe(false);
    expect(greater_than(0.5, 0.7)).toBe(false);
  });
});

describe('not_matches', () => {
  it('inverts regex', () => {
    expect(not_matches('safe command', '^rm')).toBe(true);
    expect(not_matches('rm -rf /', '^rm')).toBe(false);
  });

  it('returns false on invalid pattern (does not throw)', () => {
    expect(() => not_matches('x', '[invalid(')).not.toThrow();
    expect(not_matches('x', '[invalid(')).toBe(false);
  });
});

describe('MATCHERS dispatch table', () => {
  it('exposes all 8 ops', () => {
    expect(Object.keys(MATCHERS).sort()).toEqual(
      [
        'boolean',
        'contains',
        'exact',
        'greater_than',
        'less_than',
        'not_matches',
        'regex',
        'threshold',
      ].sort(),
    );
  });

  it('each entry is the same function as the named export', () => {
    expect(MATCHERS.exact).toBe(exact);
    expect(MATCHERS.contains).toBe(contains);
    expect(MATCHERS.regex).toBe(regex);
    expect(MATCHERS.boolean).toBe(boolean);
    expect(MATCHERS.threshold).toBe(threshold);
    expect(MATCHERS.less_than).toBe(less_than);
    expect(MATCHERS.greater_than).toBe(greater_than);
    expect(MATCHERS.not_matches).toBe(not_matches);
  });
});
