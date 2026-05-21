import { describe, it, expect } from 'vitest';
import { canonicalize } from '../../../lib/compliance/receipt/canonical';

describe('RFC 8785 canonicalize', () => {
  it('is deterministic across repeated calls on identical input', () => {
    const input = { z: 1, a: [3, 2, 1], nested: { b: true, a: null } };
    const first = canonicalize(input).toString('utf8');
    const second = canonicalize(input).toString('utf8');
    expect(first).toBe(second);
  });

  it('produces the same output regardless of key insertion order', () => {
    const a = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } }).toString('utf8');
    const b = canonicalize({ c: { x: 2, y: 1 }, a: 2, b: 1 }).toString('utf8');
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1,"c":{"x":2,"y":1}}');
  });

  it('matches the RFC 8785 §3.2.4 number-handling vector', () => {
    const input = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
    };
    const expected = '{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}';
    expect(canonicalize(input).toString('utf8')).toBe(expected);
  });

  it('handles nested objects, arrays, null, and booleans', () => {
    const input = {
      list: [1, 'two', null, true, false, { inner: [] }],
      flag: true,
      empty: {},
    };
    const out = canonicalize(input).toString('utf8');
    expect(out).toBe(
      '{"empty":{},"flag":true,"list":[1,"two",null,true,false,{"inner":[]}]}',
    );
  });
});
