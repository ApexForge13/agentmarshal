import { describe, it, expect, beforeEach } from 'vitest';
import { dataSourceProvenanceRecordedPredicate } from '../../../lib/compliance/predicates/sourcing/data-source-provenance-recorded';
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

describe('sourcing data_source_provenance_recorded predicate (Bubble 1 stub)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(dataSourceProvenanceRecordedPredicate);
  });

  it('registers and returns stub shape with deferred reason', async () => {
    expect(getComposite('data_source_provenance_recorded')).toBeDefined();
    const result = await dataSourceProvenanceRecordedPredicate.evaluate(
      { lead_id: 'lead-abc-123' },
      makeCtx(),
    );
    expect(result.result).toBe('stub');
    expect(result.predicate).toBe('data_source_provenance_recorded');
    expect(result.reason).toMatch(/not yet implemented/i);
    expect(result.details.lead_id).toBe('lead-abc-123');
    expect(result.details.deferred_to).toMatch(/Bright Data integration day/);
  });
});
