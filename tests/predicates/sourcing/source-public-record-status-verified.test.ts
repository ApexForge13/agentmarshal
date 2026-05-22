import { describe, it, expect, beforeEach } from 'vitest';
import { sourcePublicRecordStatusVerifiedPredicate } from '../../../lib/compliance/predicates/sourcing/source-public-record-status-verified';
import {
  registerComposite,
  clearComposites,
  getComposite,
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

  it('registers and returns stub shape with deferred reason', async () => {
    expect(getComposite('source_public_record_status_verified')).toBeDefined();
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
});
