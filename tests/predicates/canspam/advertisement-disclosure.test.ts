import { describe, it, expect } from 'vitest';
import { advertisementDisclosurePredicate } from '../../../lib/compliance/predicates/canspam/advertisement-disclosure';
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

describe('CAN-SPAM advertisement-disclosure predicate', () => {
  it('passes when an X-Advertisement header is present', async () => {
    const result = await advertisementDisclosurePredicate.evaluate(
      {
        email_body: 'Hi there, our new offering is now live.',
        email_headers: { 'X-Advertisement': 'true' },
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('email_headers');
    expect(result.details.header).toBe('x-advertisement');
  });

  it('passes when a disclosure phrase appears in email_body', async () => {
    const result = await advertisementDisclosurePredicate.evaluate(
      {
        email_body:
          'This is an advertisement from Acme Roofing. Visit our site for more info.',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('email_body');
    expect(String(result.details.matched_phrase).toLowerCase()).toContain('advertisement');
  });

  it('passes when a disclosure phrase appears in email_html', async () => {
    const result = await advertisementDisclosurePredicate.evaluate(
      {
        email_html:
          '<p>Hi,</p><p><small>This is a promotional message from Acme Roofing.</small></p>',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('email_html');
    expect(String(result.details.matched_phrase).toLowerCase()).toMatch(/promotional message/);
  });

  it('fails when no disclosure marker is present in headers, body, or HTML', async () => {
    const result = await advertisementDisclosurePredicate.evaluate(
      {
        email_body: 'Just a quick hello from your friend!',
        email_html: '<p>Just a quick hello from your friend!</p>',
      },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/no advertisement disclosure/i);
  });
});
