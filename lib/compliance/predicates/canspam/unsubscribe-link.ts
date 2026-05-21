// CAN-SPAM unsubscribe link composite predicate.
// 15 USC §7704(a)(3): commercial messages must include a working unsubscribe mechanism.
// This predicate checks PRESENCE of the link/header; mechanism liveness is a separate
// predicate (canspam_unsubscribe_mechanism_working) deferred to Day 6.
//
// Pass if any of:
//   - List-Unsubscribe header present (RFC 2369 / RFC 8058)
//   - email_html contains an <a> whose href OR text matches /unsubscribe/i
//   - email_text contains "unsubscribe" within 200 chars of an http(s) URL

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface UnsubscribeLinkInput {
  email_html?: string;
  email_text?: string;
  list_unsubscribe_header?: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    email_html: { type: 'string' },
    email_text: { type: 'string' },
    list_unsubscribe_header: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'canspam_unsubscribe_link_present';
const URL_PROXIMITY_CHARS = 200;

const HREF_UNSUB = /<a[^>]*href=["'][^"']*unsubscribe[^"']*["']/i;
const TEXT_UNSUB = /<a[^>]*>[^<]*unsubscribe[^<]*<\/a>/i;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

export const unsubscribeLinkPredicate: CompositePredicate<UnsubscribeLinkInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    if (input.list_unsubscribe_header) {
      return pass('List-Unsubscribe header present', {
        source: 'list_unsubscribe_header',
      });
    }

    if (input.email_html) {
      if (HREF_UNSUB.test(input.email_html)) {
        return pass('unsubscribe anchor href found in email_html', { source: 'email_html.href' });
      }
      if (TEXT_UNSUB.test(input.email_html)) {
        return pass('unsubscribe anchor text found in email_html', { source: 'email_html.text' });
      }
    }

    if (input.email_text && nearbyUnsubscribe(input.email_text)) {
      return pass('unsubscribe keyword found near URL in email_text', { source: 'email_text' });
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason:
        'no unsubscribe mechanism found in List-Unsubscribe header, HTML body, or text body',
      details: {
        had_html: typeof input.email_html === 'string',
        had_text: typeof input.email_text === 'string',
        had_header: typeof input.list_unsubscribe_header === 'string',
      },
    };
  },
};

function pass(reason: string, details: Record<string, unknown>): CompositePredicateEvaluation {
  return { predicate: PREDICATE_NAME, result: 'pass', reason, details };
}

function nearbyUnsubscribe(text: string): boolean {
  const urls = [...text.matchAll(URL_PATTERN)];
  for (const match of urls) {
    const idx = match.index ?? 0;
    const start = Math.max(0, idx - URL_PROXIMITY_CHARS);
    const end = Math.min(text.length, idx + match[0].length + URL_PROXIMITY_CHARS);
    if (/unsubscribe/i.test(text.slice(start, end))) {
      return true;
    }
  }
  return false;
}
