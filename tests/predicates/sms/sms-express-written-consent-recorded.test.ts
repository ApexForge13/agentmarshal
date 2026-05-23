import { describe, it, expect, beforeEach } from 'vitest';
import { smsExpressWrittenConsentRecordedPredicate } from '../../../lib/compliance/predicates/sms/sms-express-written-consent-recorded';
import {
  registerComposite,
  clearComposites,
  getComposite,
  isAllowable,
  type CompositePredicateEvaluation,
} from '../../../lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '../../../lib/authzen/eval-context';

function makeCtx(): EvalContext {
  return {
    now: new Date('2026-05-23T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('sms sms_express_written_consent_recorded predicate (Bubble 5b stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(smsExpressWrittenConsentRecordedPredicate);
  });

  it('registers under the expected name', () => {
    const predicate = getComposite('sms_express_written_consent_recorded');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('sms_express_written_consent_recorded');
  });

  it('returns stub shape with SMS-surface deferred_to anchor', async () => {
    const result = await smsExpressWrittenConsentRecordedPredicate.evaluate(
      { recipient_phone: '+15555550123', seller_id: 'tenant-roofing-llc' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('sms_express_written_consent_recorded');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.recipient_phone).toBe('+15555550123');
    expect(result.details.seller_id).toBe('tenant-roofing-llc');
    expect(result.details.deferred_to).toBe('SMS surface (v0.3)');
  });

  it('isAllowable returns false when this stub is in the trace', () => {
    const evals: CompositePredicateEvaluation[] = [
      {
        predicate: 'sms_express_written_consent_recorded',
        result: 'stub',
        reason: '',
        details: {},
      },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});
