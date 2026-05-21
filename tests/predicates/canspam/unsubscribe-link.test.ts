import { describe, it, expect } from 'vitest';
import { unsubscribeLinkPredicate } from '../../../lib/compliance/predicates/canspam/unsubscribe-link';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date('2026-05-21T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('CAN-SPAM unsubscribe-link predicate', () => {
  it('passes when email_html contains an anchor with unsubscribe in href', async () => {
    const result = await unsubscribeLinkPredicate.evaluate(
      {
        email_html:
          '<p>Hi,</p><p>Best regards.</p><a href="https://example.com/unsubscribe?id=42">manage</a>',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('email_html.href');
  });

  it('passes when list_unsubscribe_header is present', async () => {
    const result = await unsubscribeLinkPredicate.evaluate(
      { list_unsubscribe_header: '<mailto:unsub@example.com>, <https://example.com/u/42>' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('list_unsubscribe_header');
  });

  it('passes when email_text contains unsubscribe within 200 chars of an http URL', async () => {
    const result = await unsubscribeLinkPredicate.evaluate(
      {
        email_text:
          'Thanks for being a customer. To unsubscribe from these emails, visit https://example.com/u/42 at any time.',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('email_text');
  });

  it('fails when no unsubscribe mechanism is present in any field', async () => {
    const result = await unsubscribeLinkPredicate.evaluate(
      { email_html: '<p>Just a friendly hello, no commercial intent here.</p>' },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/no unsubscribe mechanism/i);
  });
});
