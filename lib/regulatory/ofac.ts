// Regulatory state provider — OFAC SDN snapshot for the trading-desk dashboard.
//
// Source abstraction (Phase 3): the v0.2 hackathon build serves a fixture
// snapshot with status "awaiting_feed". The Bright Data-wired feed is a provider
// swap behind RegulatoryStateProvider — the panel renders whatever getSnapshot()
// returns and never learns where the list came from, so wiring the live feed is
// a provider swap, not a panel rewrite.
//
// The fingerprint MUST match the one the entity_not_sanctioned composite stamps
// into each receipt (sha256 over the ascending-sorted, newline-joined entries),
// so a reader comparing the panel to a receipt's sdn_list_fingerprint sees the
// same snapshot id. tests/dashboard/ofac.test.ts locks that equivalence.

import { sha256Hex } from '@/lib/compliance/receipt/hash';

export type RegulatoryFeedStatus = 'awaiting_feed' | 'live';

export interface OfacSdnFingerprint {
  algo: 'sha256';
  hash: string;
  length: number;
}

export interface OfacSnapshot {
  /** Display source label, e.g. "OFAC SDN List". */
  source: string;
  /** "awaiting_feed" (yellow) for v0.2; flips to "live" (green) on BD wiring. */
  status: RegulatoryFeedStatus;
  /** ISO 8601 timestamp of the last fetch. */
  last_updated: string;
  entry_count: number;
  fingerprint: OfacSdnFingerprint;
  list: string[];
}

export interface RegulatoryStateProvider {
  getSnapshot(): OfacSnapshot;
}

// v0.2 fixture: the same SDN entries Bubble 13 injects via
// action_properties.regulatory_state.ofac_sdn_list across the trading scenarios.
// The scenarios carry an inlined copy; tests/dashboard/ofac.test.ts asserts this
// list deep-equals each scenario's list so the two can never silently drift.
const FIXTURE_SDN_LIST: readonly string[] = [
  'SYN-SDN-IRAN-MARITIME-001',
  'SYN-SDN-CRIMEA-BANK-007',
  'SYN-SDN-DPRK-TRADING-042',
];

// Fixture "last fetched" time. Static for the hackathon build; the BD-wired
// provider stamps the real fetch time.
const FIXTURE_LAST_UPDATED = '2026-05-24T00:00:00Z';

/** sha256 over the ascending-sorted, newline-joined entries, plus entry count. */
export function fingerprintSdnList(list: readonly string[]): OfacSdnFingerprint {
  const canonical = [...list].sort().join('\n');
  return {
    algo: 'sha256',
    hash: sha256Hex(Buffer.from(canonical, 'utf-8')),
    length: list.length,
  };
}

class FixtureRegulatoryStateProvider implements RegulatoryStateProvider {
  getSnapshot(): OfacSnapshot {
    const list = [...FIXTURE_SDN_LIST];
    return {
      source: 'OFAC SDN List',
      status: 'awaiting_feed',
      last_updated: FIXTURE_LAST_UPDATED,
      entry_count: list.length,
      fingerprint: fingerprintSdnList(list),
      list,
    };
  }
}

export const fixtureRegulatoryStateProvider: RegulatoryStateProvider =
  new FixtureRegulatoryStateProvider();

/** Default provider for v0.2. Swap for the Bright Data provider when it lands. */
export function getOfacSnapshot(): OfacSnapshot {
  return fixtureRegulatoryStateProvider.getSnapshot();
}
