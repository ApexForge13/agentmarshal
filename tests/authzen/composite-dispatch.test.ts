import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerComposite,
  getComposite,
  clearComposites,
  validateCompositeInput,
  isAllowable,
  type CompositePredicate,
  type CompositePredicateEvaluation,
} from '../../lib/authzen/composite-dispatch';
import { NULL_EMITTER } from '../../lib/authzen/eval-context';

const samplePredicate: CompositePredicate<{ value: string }> = {
  name: 'sample',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['value'],
    properties: { value: { type: 'string', minLength: 1 } },
    additionalProperties: false,
  },
  async evaluate(_input, _ctx) {
    return { predicate: 'sample', result: 'pass', reason: 'ok', details: {} };
  },
};

void NULL_EMITTER; // imported for parity with predicate test files; suppress unused warning

describe('composite dispatch', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('register + get round-trips a composite predicate by name', () => {
    registerComposite(samplePredicate);
    expect(getComposite('sample')?.name).toBe('sample');
  });

  it('getComposite returns undefined for an unregistered name', () => {
    expect(getComposite('does-not-exist')).toBeUndefined();
  });

  it('validateCompositeInput rejects input that fails the Ajv schema', () => {
    registerComposite(samplePredicate);
    const result = validateCompositeInput('sample', { value: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('isAllowable returns true when every evaluation is pass', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'a', result: 'pass', reason: '', details: {} },
      { predicate: 'b', result: 'pass', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(true);
  });

  it('isAllowable returns false when any evaluation is stub or fail', () => {
    const withStub: CompositePredicateEvaluation[] = [
      { predicate: 'a', result: 'pass', reason: '', details: {} },
      { predicate: 'b', result: 'stub', reason: 'not yet implemented', details: {} },
    ];
    const withFail: CompositePredicateEvaluation[] = [
      { predicate: 'a', result: 'pass', reason: '', details: {} },
      { predicate: 'b', result: 'fail', reason: 'denied', details: {} },
    ];
    expect(isAllowable(withStub)).toBe(false);
    expect(isAllowable(withFail)).toBe(false);
  });
});
