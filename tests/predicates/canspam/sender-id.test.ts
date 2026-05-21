import { describe, it, expect } from 'vitest';
import { senderIdPredicate } from '../../../lib/compliance/predicates/canspam/sender-id';
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

describe('CAN-SPAM sender-id predicate', () => {
  it('passes when an angle-bracketed From-header address matches an authorized sender', async () => {
    const result = await senderIdPredicate.evaluate(
      {
        from_header: '"Conner" <conner@echogrowthlabs.com>',
        authorized_senders: ['conner@echogrowthlabs.com'],
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.extracted_address).toBe('conner@echogrowthlabs.com');
    expect(result.details.authorized_match).toBe('conner@echogrowthlabs.com');
  });

  it('passes when a bare From-header address matches an authorized sender (case-insensitive)', async () => {
    const result = await senderIdPredicate.evaluate(
      {
        from_header: 'Conner@EchoGrowthLabs.com',
        authorized_senders: ['conner@echogrowthlabs.com'],
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.extracted_address).toBe('Conner@EchoGrowthLabs.com');
    expect(result.details.authorized_match).toBe('conner@echogrowthlabs.com');
  });

  it('fails when the From-header address is not in authorized_senders', async () => {
    const result = await senderIdPredicate.evaluate(
      {
        from_header: '"Imposter" <imposter@example.com>',
        authorized_senders: ['conner@echogrowthlabs.com'],
      },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/not in authorized_senders/i);
    expect(result.details.extracted_address).toBe('imposter@example.com');
  });

  it('fails when authorized_senders is empty (no entry can match)', async () => {
    const result = await senderIdPredicate.evaluate(
      {
        from_header: 'conner@echogrowthlabs.com',
        authorized_senders: [],
      },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/authorized_senders list is empty/i);
  });
});
