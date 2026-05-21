// RFC 8785 (JSON Canonicalization Scheme) wrapper.
// Receipts declare `canonical_form: 'rfc8785'` so verifiers know which algorithm
// produced the bytes that were signed.

import jcsCanonicalize from 'canonicalize';

/**
 * Canonicalize a JSON-serializable value per RFC 8785.
 * Input must be JSON-serializable (no functions, symbols, undefined values).
 * Output is UTF-8 bytes of the canonical JSON form.
 */
export function canonicalize(value: unknown): Buffer {
  if (value === undefined) {
    throw new TypeError('canonicalize(): undefined is not representable in JSON');
  }
  const canonical = jcsCanonicalize(value);
  if (canonical === undefined) {
    throw new TypeError('canonicalize(): input could not be canonicalized');
  }
  return Buffer.from(canonical, 'utf8');
}
