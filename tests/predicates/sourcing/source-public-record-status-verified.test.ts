import { describe, it, expect, beforeEach } from 'vitest';
import { sourcePublicRecordStatusVerifiedPredicate } from '../../../lib/compliance/predicates/sourcing/source-public-record-status-verified';
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
    now: new Date('2026-05-21T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
  };
}

describe('sourcing source_public_record_status_verified predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(sourcePublicRecordStatusVerifiedPredicate);
  });

  it('registers the composite predicate by name', () => {
    const predicate = getComposite('source_public_record_status_verified');
    expect(predicate).toBeDefined();
    expect(predicate?.name).toBe('source_public_record_status_verified');
  });

  it('returns stub-shape result on evaluation', async () => {
    const result = await sourcePublicRecordStatusVerifiedPredicate.evaluate(
      { source_id: 'tx-sos-roofing-license-index' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('source_public_record_status_verified');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.source_id).toBe('tx-sos-roofing-license-index');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });

  it('blocks isAllowable when the stub appears in an evaluation', () => {
    const evals: CompositePredicateEvaluation[] = [
      { predicate: 'source_public_record_status_verified', result: 'stub', reason: '', details: {} },
    ];
    expect(isAllowable(evals)).toBe(false);
  });
});
