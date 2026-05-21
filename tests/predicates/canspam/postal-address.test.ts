import { describe, it, expect } from 'vitest';
import { postalAddressPredicate } from '../../../lib/compliance/predicates/canspam/postal-address';
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

describe('CAN-SPAM postal-address predicate', () => {
  it('passes when sender_postal_address is present and well-formed', async () => {
    const result = await postalAddressPredicate.evaluate(
      {
        email_body: 'Some body content here.',
        sender_postal_address: '123 Peachtree St, Atlanta, GA 30309',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('sender_postal_address');
  });

  it('passes when a US-format address appears in the email_body', async () => {
    const result = await postalAddressPredicate.evaluate(
      {
        email_body:
          'Acme Roofing\n123 Peachtree St, Atlanta, GA 30309\nReply to opt out.',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.source).toBe('email_body');
    expect(result.details.matched_address).toMatch(/Atlanta, GA 30309/);
  });

  it('fails when neither sender_postal_address nor a body match is present', async () => {
    const result = await postalAddressPredicate.evaluate(
      { email_body: 'Hi there, this is a quick note with no postal info.' },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/no physical postal address/i);
  });

  it('fails when sender_postal_address is present but malformed (no ZIP)', async () => {
    const result = await postalAddressPredicate.evaluate(
      {
        email_body: 'Some body.',
        sender_postal_address: '123 Peachtree St, Atlanta GA',
      },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/not in recognized US format/i);
  });
});
