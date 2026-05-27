import { describe, it, expect, beforeEach } from 'vitest';
import { bdServiceAuthorizedPredicate } from '@/lib/compliance/predicates/bd/bd_service_authorized';
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

const BD_PERMISSIONS = [
  { rule_id: 'adverse_media_serp', match: { service: 'serp_api' }, decision: 'permit' },
];

describe('bd_service_authorized composite (Bubble 17)', () => {
  beforeEach(() => {
    clearComposites();
    registerComposite(bdServiceAuthorizedPredicate);
  });

  it('registers by name', () => {
    expect(getComposite('bd_service_authorized')?.name).toBe('bd_service_authorized');
  });

  it("PASS — bd_call.service is authorized by a bd_permissions rule", async () => {
    const r = await bdServiceAuthorizedPredicate.evaluate(
      {},
      makeCtx({ bd_call: { service: 'serp_api' }, bd_permissions: BD_PERMISSIONS }),
    );
    expect(r.result).toBe('pass');
    expect(r.details.service).toBe('serp_api');
    expect(isAllowable([r])).toBe(true);
  });

  it("FAIL — bd_call.service not declared by any rule", async () => {
    const r = await bdServiceAuthorizedPredicate.evaluate(
      {},
      makeCtx({ bd_call: { service: 'web_unlocker' }, bd_permissions: BD_PERMISSIONS }),
    );
    expect(r.result).toBe('fail');
    expect(r.reason).toBe('service web_unlocker not authorized by any bd_permissions rule');
    expect(isAllowable([r])).toBe(false);
  });

  it("STUB — bd_call absent (unresolved input)", async () => {
    const r = await bdServiceAuthorizedPredicate.evaluate({}, makeCtx({ bd_permissions: BD_PERMISSIONS }));
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_call.service');
    expect(isAllowable([r])).toBe(false);
  });

  it("STUB — bd_permissions absent (unresolved input)", async () => {
    const r = await bdServiceAuthorizedPredicate.evaluate({}, makeCtx({ bd_call: { service: 'serp_api' } }));
    expect(r.result).toBe('stub');
    expect(r.details.missing).toContain('bd_permissions');
  });
});
