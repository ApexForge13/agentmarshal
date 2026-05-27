// Bubble 17: scope-contract.schema.json bd_permissions validation.
//
// bd_permissions is an OPTIONAL top-level array consulted only by the MCP proxy.
// Contracts without it validate unchanged (backward-compatible); a well-formed
// bd_permissions array validates; malformed entries fail with a clear error.

import { describe, it, expect } from 'vitest';
import { validateContract, formatContractErrors } from '@/lib/authzen/contract-schema';
import tradingV1 from '@/data/contracts/trading_v1.json';
import tradingV2 from '@/data/contracts/trading_v2.json';

// Minimal schema-valid contract WITHOUT bd_permissions. Each case bolts a
// bd_permissions array on top via spread; validateContract() takes `unknown`.
function baseContract(): Record<string, unknown> {
  return {
    scope_contract_version: '0.1',
    contract_id: 'bd-permissions-fixture',
    agent_id: 'agentmarshal:contract/bd-permissions-fixture',
    issuer: { type: 'system', id: 'agentmarshal:test' },
    issued_at: '2026-05-26T00:00:00Z',
    declared_scope: [
      {
        rule_id: 'allow-any',
        match: { subject: { id: { exists: true } } },
        decision: { effect: 'allow' },
      },
    ],
  };
}

// A structurally-complete bd_permissions rule.
function validBdRule(): Record<string, unknown> {
  return {
    rule_id: 'adverse_media_serp',
    description: 'SERP adverse-media screen',
    match: {
      service: 'serp_api',
      tool: 'search_google',
      parameters: { purpose: { equals: 'adverse_media_screening' } },
    },
    constraints: { max_calls_per_evaluation: 4, response_handling: 'fingerprint' },
    composite_checks: ['bd_service_authorized', 'bd_query_purpose_matches'],
    decision: 'permit',
  };
}

describe('scope-contract.schema.json — bd_permissions (Bubble 17)', () => {
  it('the shipped trading_v2 contract (with bd_permissions) validates', () => {
    expect(validateContract(tradingV2).valid).toBe(true);
  });

  it('trading_v1 (no bd_permissions) still validates — additive/optional field', () => {
    expect(validateContract(tradingV1).valid).toBe(true);
  });

  it('a contract with a well-formed bd_permissions array validates', () => {
    expect(validateContract({ ...baseContract(), bd_permissions: [validBdRule()] }).valid).toBe(
      true,
    );
  });

  it('rejects a bd_permissions rule missing match.service (clear error)', () => {
    const c = {
      ...baseContract(),
      bd_permissions: [{ ...validBdRule(), match: { tool: 'search_google' } }],
    };
    const r = validateContract(c);
    expect(r.valid).toBe(false);
    expect(formatContractErrors(r.errors).join(' ')).toMatch(/service/);
  });

  it('rejects a bd_permissions rule missing the required rule_id', () => {
    const c = {
      ...baseContract(),
      bd_permissions: [
        {
          match: { service: 'serp_api' },
          decision: 'permit',
        },
      ],
    };
    expect(validateContract(c).valid).toBe(false);
  });

  it('rejects a non-permit decision (enum is permit-only)', () => {
    const c = { ...baseContract(), bd_permissions: [{ ...validBdRule(), decision: 'deny' }] };
    expect(validateContract(c).valid).toBe(false);
  });

  it('rejects composite_checks shaped as objects (must be plain string ids)', () => {
    const c = {
      ...baseContract(),
      bd_permissions: [{ ...validBdRule(), composite_checks: [{ predicate: 'bd_service_authorized' }] }],
    };
    expect(validateContract(c).valid).toBe(false);
  });

  it('rejects an unknown service enum value', () => {
    const c = {
      ...baseContract(),
      bd_permissions: [{ ...validBdRule(), match: { service: 'not_a_real_service' } }],
    };
    expect(validateContract(c).valid).toBe(false);
  });

  it('rejects an unknown parameter-predicate operator', () => {
    const c = {
      ...baseContract(),
      bd_permissions: [
        { ...validBdRule(), match: { service: 'serp_api', parameters: { purpose: { startsWith: 'x' } } } },
      ],
    };
    expect(validateContract(c).valid).toBe(false);
  });
});
