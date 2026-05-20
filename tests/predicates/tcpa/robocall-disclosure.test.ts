import { describe, it, expect } from 'vitest';
import { robocallDisclosurePredicate } from '../../../lib/compliance/predicates/tcpa/robocall-disclosure';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date(),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('TCPA robocall disclosure predicate', () => {
  it('passes an artificial call that includes disclosure and opt-out', async () => {
    const result = await robocallDisclosurePredicate.evaluate(
      {
        call_type: 'artificial',
        disclosure_text: 'This is an automated call from Acme Roofing.',
        opt_out_method: 'press 9 to opt out',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
  });

  it('fails an artificial call missing disclosure_text', async () => {
    const result = await robocallDisclosurePredicate.evaluate(
      { call_type: 'artificial' },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/disclosure_text/);
  });

  it('passes a human call (predicate not applicable)', async () => {
    const result = await robocallDisclosurePredicate.evaluate(
      { call_type: 'human' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.applicable).toBe(false);
  });

  it('fails a prerecorded call missing opt_out_method', async () => {
    const result = await robocallDisclosurePredicate.evaluate(
      {
        call_type: 'prerecorded',
        disclosure_text: 'Hi this is Acme.',
      },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/opt_out_method/);
  });
});
