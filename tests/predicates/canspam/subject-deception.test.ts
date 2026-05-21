import { describe, it, expect } from 'vitest';
import { subjectDeceptionPredicate } from '../../../lib/compliance/predicates/canspam/subject-deception';
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

describe('CAN-SPAM subject-deception predicate', () => {
  it('passes when subject is clean and uses normal capitalization', async () => {
    const result = await subjectDeceptionPredicate.evaluate(
      { subject: 'Following up on our roofing estimate' },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
    expect(result.details.subject).toBe('Following up on our roofing estimate');
  });

  it('fails when subject is empty (deceptive by omission)', async () => {
    const result = await subjectDeceptionPredicate.evaluate(
      { subject: '   ' },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/empty/i);
    expect(result.details.detected).toBe('empty_subject');
  });

  it('fails when subject uses Re:/Fwd: prefix without a prior thread', async () => {
    const result = await subjectDeceptionPredicate.evaluate(
      { subject: 'Re: your account upgrade', has_prior_thread: false },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/no prior thread/i);
    expect(result.details.detected).toBe('fake_reply_marker');
  });

  it('fails when subject contains a known scam phrase', async () => {
    const result = await subjectDeceptionPredicate.evaluate(
      { subject: 'Congratulations, you won a free iPad!' },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.details.detected).toBe('scam_phrase');
    expect(String(result.details.matched_phrase).toLowerCase()).toContain('you won');
  });

  it('fails when subject is excessively capitalized', async () => {
    const result = await subjectDeceptionPredicate.evaluate(
      { subject: 'URGENT REPLY NEEDED NOW' },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.details.detected).toBe('all_caps');
  });
});
