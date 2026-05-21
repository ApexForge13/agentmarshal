import { describe, it, expect } from 'vitest';
import vectorsJson from '../../vectors/jcs-test-vectors.json';
import { canonicalize } from '../../../lib/compliance/receipt/canonical';

interface JcsVector {
  name: string;
  input: unknown;
  expected: string;
}

const vectors = vectorsJson as JcsVector[];

describe('RFC 8785 (JCS) canonicalization vectors', () => {
  for (const vec of vectors) {
    it(`canonicalizes: ${vec.name}`, () => {
      expect(canonicalize(vec.input).toString('utf8')).toBe(vec.expected);
    });
  }
});
