// Ambient feed simulation math (Bubble 16). Tests the pure jitter + weighted
// selection functions deterministically — no setInterval, no real firing.

import { describe, it, expect } from 'vitest';
import {
  GREEN_SCENARIOS,
  YELLOW_SCENARIOS,
  RED_SCENARIOS,
  AMBIENT_BASE_MS,
  AMBIENT_JITTER_MS,
  jitterDelay,
  pickPool,
  selectAmbientScenario,
} from '@/lib/dashboard/ambient-scenarios';

describe('ambient jitter math', () => {
  it('maps rand ∈ [0,1) to [base, base+jitter)', () => {
    expect(jitterDelay(0)).toBe(AMBIENT_BASE_MS); // 3000
    expect(jitterDelay(0.9999)).toBe(AMBIENT_BASE_MS + AMBIENT_JITTER_MS - 1); // 7999
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const d = jitterDelay(r);
      expect(d).toBeGreaterThanOrEqual(AMBIENT_BASE_MS);
      expect(d).toBeLessThan(AMBIENT_BASE_MS + AMBIENT_JITTER_MS);
    }
  });
});

describe('ambient weighted pool selection', () => {
  it('weights 80% green / 15% yellow / 5% red at the boundaries', () => {
    expect(pickPool(0)).toBe('green');
    expect(pickPool(0.79)).toBe('green');
    expect(pickPool(0.8)).toBe('yellow');
    expect(pickPool(0.94)).toBe('yellow');
    expect(pickPool(0.95)).toBe('red');
    expect(pickPool(0.999)).toBe('red');
  });

  it('selects within the chosen pool and tags the weight class', () => {
    expect(selectAmbientScenario(0, 0).weightClass).toBe('green');
    expect(selectAmbientScenario(0.85, 0).weightClass).toBe('yellow');
    expect(selectAmbientScenario(0.99, 0).weightClass).toBe('red');
    // pickRand selects the index within the pool.
    expect(selectAmbientScenario(0, 0)).toBe(GREEN_SCENARIOS[0]);
    expect(selectAmbientScenario(0, 0.9999)).toBe(GREEN_SCENARIOS[GREEN_SCENARIOS.length - 1]);
  });
});

describe('ambient scenario pools', () => {
  it('has the spec pool sizes (10 green / 3 yellow / 1 red)', () => {
    expect(GREEN_SCENARIOS).toHaveLength(10);
    expect(YELLOW_SCENARIOS).toHaveLength(3);
    expect(RED_SCENARIOS).toHaveLength(1);
  });

  it('every scenario injects the SDN list + an entity so the composite resolves', () => {
    for (const s of [...GREEN_SCENARIOS, ...YELLOW_SCENARIOS, ...RED_SCENARIOS]) {
      const props = s.request.action.properties as Record<string, unknown>;
      const reg = props.regulatory_state as { ofac_sdn_list: string[] };
      const entity = props.entity as { id: string };
      expect(Array.isArray(reg.ofac_sdn_list)).toBe(true);
      expect(reg.ofac_sdn_list.length).toBeGreaterThan(0);
      expect(typeof entity.id).toBe('string');
    }
  });

  it('yellow entities contain a region token; the red is the exact SDN hit', () => {
    const yellowIds = YELLOW_SCENARIOS.map(
      (s) => (s.request.action.properties as { entity: { id: string } }).entity.id,
    );
    expect(yellowIds).toEqual(
      expect.arrayContaining(['ENT-IRAN-RESEARCH-555', 'ENT-CRIMEA-HOLDINGS-LLC', 'ENT-DPRK-CORP-77']),
    );
    const redId = (RED_SCENARIOS[0].request.action.properties as { entity: { id: string } }).entity.id;
    expect(redId).toBe('SYN-SDN-IRAN-MARITIME-001');
  });
});
