import { describe, it, expect, beforeEach } from 'vitest';
import { consentPredicate } from '../../../lib/compliance/predicates/tcpa/consent';
import {
  registerComposite,
  validateCompositeInput,
  clearComposites,
} from '../../../lib/authzen/composite-dispatch';
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

describe('TCPA consent predicate', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(consentPredicate);
  });

  it('passes a sales call with written_express consent', async () => {
    const result = await consentPredicate.evaluate(
      {
        consent_record_id: 'consent_abc123',
        consent_level: 'written_express',
        call_type: 'sales',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
  });

  it('fails a sales call missing consent_record_id', async () => {
    const result = await consentPredicate.evaluate({ call_type: 'sales' }, makeCtx());
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/no consent_record_id/i);
  });

  it('fails a sales call with only informal consent', async () => {
    const result = await consentPredicate.evaluate(
      {
        consent_record_id: 'consent_xyz',
        consent_level: 'informal',
        call_type: 'sales',
      },
      makeCtx(),
    );
    expect(result.result).toBe('fail');
    expect(result.reason).toMatch(/written_express/);
  });

  it('passes an informational call with informal consent', async () => {
    const result = await consentPredicate.evaluate(
      {
        consent_record_id: 'consent_inf',
        consent_level: 'informal',
        call_type: 'informational',
      },
      makeCtx(),
    );
    expect(result.result).toBe('pass');
  });

  it('Ajv rejects an unknown call_type value', () => {
    const validation = validateCompositeInput(consentPredicate.name, {
      consent_record_id: 'x',
      call_type: 'spam',
    });
    expect(validation.valid).toBe(false);
  });
});
