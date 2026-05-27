import { describe, it, expect, beforeEach } from 'vitest';
import { bdQueryPurposeMatchesPredicate } from '@/lib/compliance/predicates/bd/bd_query_purpose_matches';
import {
  registerComposite,
  clearComposites,
  getComposite,
  isAllowable,
} from '@/lib/authzen/composite-dispatch';
import { NULL_EMITTER, type EvalContext } from '@/lib/authzen/eval-context';

function makeCtx(action_properties?: Record<string, unknown>): EvalContext {
  return {
    now: new Date('2026-05-26T14:00:00Z'),
    tenant_id: 't',
    agent_id: 'a',
    request_id: 'r',
    audit: NULL_EMITTER,
    action_properties,
  };
}

const MATCHED_RULE = {
  rule_id: 'adverse_media_serp',
  match: { service: 'serp_api', parameters: { purpose: { equals: 'adverse_media_screening' } } },
  decision: 'permit',
};

describe('bd_query_purpose_matches composite (Bubble 17)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(bdQueryPurposeMatchesPredicate);
  });

  it('registers by name', () => {
    expect(getComposite('bd_query_purpose_matches')?.name).toBe('bd_query_purpose_matches');
  });

  it("PASS — call purpose equals the matched rule's declared purpose", async () => {
    const r = await bdQueryPurposeMatchesPredicate.evaluate(
      {},
      makeCtx({
        bd_call: { service: 'serp_api', parameters: { purpose: 'adverse_media_screening' } },
        bd_matched_rule: MATCHED_RULE,
      }),
    );
    expect(r.result).toBe('pass');
    expect(r.details.purpose).toBe('adverse_media_screening');
    expect(isAllowable([r])).toBe(true);
  });

  it("FAIL — call purpose differs from the declared purpose", async () => {
    const r = await bdQueryPurposeMatchesPredicate.evaluate(
      {},
      makeCtx({
        bd_call: { service: 'serp_api', parameters: { purpose: 'price_scraping' } },
        bd_matched_rule: MATCHED_RULE,
      }),
    );
    expect(r.result).toBe('fail');
    expect(r.reason).toBe('purpose price_scraping does not match declared adverse_media_screening');
    expect(isAllowable([r])).toBe(false);
  });

  it("STUB — call purpose absent (unresolved input)", async () => {
    const r = await bdQueryPurposeMatchesPredicate.evaluate(
      {},
      makeCtx({ bd_call: { service: 'serp_api', parameters: {} }, bd_matched_rule: MATCHED_RULE }),
    );
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_call.parameters.purpose');
  });

  it("STUB — matched rule's declared purpose absent (unresolved input)", async () => {
    const r = await bdQueryPurposeMatchesPredicate.evaluate(
      {},
      makeCtx({
        bd_call: { service: 'serp_api', parameters: { purpose: 'adverse_media_screening' } },
        bd_matched_rule: { rule_id: 'x', match: { service: 'serp_api' }, decision: 'permit' },
      }),
    );
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_matched_rule.match.parameters.purpose.equals');
  });
});
