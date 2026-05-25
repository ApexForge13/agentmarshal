// File-backed Scope Contract loader tests (Bubble 7).
// Exercises lib/authzen/contracts.ts: schema-validated disk loading,
// agent→contract resolution from data/agent-contract-map.json, in-memory
// cache, and fallback to STUB_PERMISSIVE_ALLOW on map-miss or load error.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fsp } from 'fs';
import {
  loadContractFromDisk,
  resolveContractIdForAgent,
  loadContractForAgent,
  clearContractCache,
} from '../../lib/authzen/contracts';

describe('Scope Contract loader (Bubble 7)', () => {
  beforeEach(() => {
    clearContractCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearContractCache();
  });

  describe('loadContractFromDisk', () => {
    it('returns parsed contract for a known seed file (voice_v1)', async () => {
      const contract = await loadContractFromDisk('voice_v1');
      expect(contract.contract_id).toBe('voice_v1');
      expect(contract.scope_contract_version).toBe('0.1');
      expect(contract.declared_scope).toHaveLength(1);
      expect(contract.declared_scope[0].composite_checks).toBeDefined();
      expect(contract.declared_scope[0].composite_checks).toHaveLength(4);
    });

    it('throws on missing file', async () => {
      await expect(
        loadContractFromDisk('__definitely_does_not_exist_xyz'),
      ).rejects.toThrow();
    });

    it('throws on schema-invalid file', async () => {
      const spy = vi.spyOn(fsp, 'readFile').mockImplementationOnce(async () => {
        // Valid JSON, but missing required fields (agent_id, issuer, issued_at, declared_scope).
        return JSON.stringify({
          scope_contract_version: '0.1',
          contract_id: 'invalid-fixture',
        });
      });
      await expect(loadContractFromDisk('invalid-fixture')).rejects.toThrow(
        /scope-contract\.schema\.json/,
      );
      spy.mockRestore();
    });
  });

  describe('resolveContractIdForAgent', () => {
    it('returns the mapped contract_id for a known agent (voice-001 → voice_v1)', async () => {
      const id = await resolveContractIdForAgent('voice-001');
      expect(id).toBe('voice_v1');
    });

    it('returns null for an unmapped agent', async () => {
      const id = await resolveContractIdForAgent('definitely-not-in-map-agent-xyz');
      expect(id).toBeNull();
    });
  });

  describe('loadContractForAgent', () => {
    it('uses the in-memory cache on a second call for the same agent (no duplicate disk read)', async () => {
      const spy = vi.spyOn(fsp, 'readFile');

      const first = await loadContractForAgent('voice-001');
      const callsAfterFirst = spy.mock.calls.length;

      const second = await loadContractForAgent('voice-001');
      const callsAfterSecond = spy.mock.calls.length;

      expect(first).toBe(second);
      expect(first.contract_id).toBe('voice_v1');
      expect(callsAfterSecond).toBe(callsAfterFirst);
      spy.mockRestore();
    });

    it('falls back to STUB_PERMISSIVE_ALLOW when the agent-contract-map has no entry', async () => {
      const contract = await loadContractForAgent('not-in-the-seed-map-agent-zzz');
      expect(contract.contract_id).toBe('stub-permissive-v0.2-day-3');
      expect(contract.declared_scope[0].decision.reason_code).toBe('STUB_PERMISSIVE_ALLOW');
    });

    it('falls back to STUB_PERMISSIVE_ALLOW when the resolved contract file is corrupted', async () => {
      // Mock the underlying fs.readFile so the agent map points 'bad-agent' to
      // 'bad-contract', and loading 'bad-contract.json' returns invalid JSON.
      const spy = vi.spyOn(fsp, 'readFile').mockImplementation(async (filePath: unknown) => {
        const p = String(filePath);
        if (p.endsWith('agent-contract-map.json')) {
          return JSON.stringify({ 'bad-agent': 'bad-contract' });
        }
        if (p.endsWith('bad-contract.json')) {
          return '{ this is not valid JSON';
        }
        const err = new Error(`ENOENT: ${p}`);
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      });

      const contract = await loadContractForAgent('bad-agent');
      expect(contract.contract_id).toBe('stub-permissive-v0.2-day-3');
      spy.mockRestore();
    });
  });

  // Bubble 14: strictly-additive subject.type fallback. subject.id (instance-id
  // keys) resolves first; subject.type (type-name keys: TradingAgent, …) is the
  // fallback. This is what makes Bubble 13's type-name keys resolve through the
  // production evaluation path the dashboard fires against.
  describe('loadContractForAgent — subject.type fallback', () => {
    it('instance-id hit is byte-identical with and without a subject.type argument', async () => {
      // voice-001 is an instance-id key → voice_v1. The fallback path must never
      // be consulted; the second call returns the same cached contract object.
      const single = await loadContractForAgent('voice-001');
      const withType = await loadContractForAgent('voice-001', 'TradingAgent');
      expect(single.contract_id).toBe('voice_v1');
      expect(withType).toBe(single);
    });

    it('instance-id miss + subject.type hit fires the fallback (TradingAgent → trading_v1)', async () => {
      // trading-agent-001 is NOT a map key; TradingAgent IS. This is the exact
      // path the dashboard "Run demo sequence" drives through /api/access/v1/evaluation.
      const contract = await loadContractForAgent('trading-agent-001', 'TradingAgent');
      expect(contract.contract_id).toBe('trading_v1');
    });

    it('instance-id miss + subject.type miss falls back to STUB_PERMISSIVE_ALLOW (unchanged)', async () => {
      const contract = await loadContractForAgent('no-such-instance-zzz', 'NoSuchTypeZzz');
      expect(contract.contract_id).toBe('stub-permissive-v0.2-day-3');
    });

    it('instance-id and subject.type resolving different contracts → subject.id wins', async () => {
      // voice-001 → voice_v1 (id) vs TradingAgent → trading_v1 (type): the more
      // specific instance-id key takes priority over the type-name key.
      const contract = await loadContractForAgent('voice-001', 'TradingAgent');
      expect(contract.contract_id).toBe('voice_v1');
    });
  });
});
