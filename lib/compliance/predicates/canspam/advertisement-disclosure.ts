// CAN-SPAM advertisement disclosure composite predicate.
// 15 USC §7704(a)(5)(A)(ii): commercial messages must include clear and
// conspicuous identification that the message is an advertisement or
// solicitation. Pass if a disclosure marker appears in headers, the plain-text
// body, or the HTML body.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface AdvertisementDisclosureInput {
  email_body?: string;
  email_html?: string;
  email_headers?: Record<string, string>;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    email_body: { type: 'string' },
    email_html: { type: 'string' },
    email_headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'canspam_advertisement_disclosure_present';
const DISCLOSURE_RE =
  /\b(advertisement|promotional\s+(message|content|email)|this\s+is\s+an?\s+ad|sponsored\s+(message|content)|paid\s+promotion)\b/i;
const ADVERTISEMENT_HEADER_KEYS = ['x-advertisement', 'x-mailer-advertisement'];

export const advertisementDisclosurePredicate: CompositePredicate<AdvertisementDisclosureInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    if (input.email_headers) {
      const normalized = normalizeHeaders(input.email_headers);
      for (const key of ADVERTISEMENT_HEADER_KEYS) {
        if (key in normalized) {
          return pass(`disclosure header ${key} present`, {
            source: 'email_headers',
            header: key,
          });
        }
      }
      if (normalized['precedence']?.toLowerCase() === 'bulk') {
        return pass('Precedence: bulk header present', {
          source: 'email_headers',
          header: 'precedence',
        });
      }
    }

    if (input.email_body) {
      const match = input.email_body.match(DISCLOSURE_RE);
      if (match) {
        return pass('disclosure phrase found in email_body', {
          source: 'email_body',
          matched_phrase: match[0],
        });
      }
    }

    if (input.email_html) {
      const match = input.email_html.match(DISCLOSURE_RE);
      if (match) {
        return pass('disclosure phrase found in email_html', {
          source: 'email_html',
          matched_phrase: match[0],
        });
      }
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: 'no advertisement disclosure found in headers, body, or HTML',
      details: {
        had_body: typeof input.email_body === 'string',
        had_html: typeof input.email_html === 'string',
        had_headers: typeof input.email_headers === 'object',
      },
    };
  },
};

function pass(reason: string, details: Record<string, unknown>): CompositePredicateEvaluation {
  return { predicate: PREDICATE_NAME, result: 'pass', reason, details };
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}
