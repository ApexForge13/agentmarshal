// Entity-not-sanctioned composite predicate (REAL pass/fail as of Bubble 13;
// PRE-scaffold for the live OFAC SDN feed).
//
// Screens the entity an action concerns (trade counterparty, research target,
// risk-check subject) against the OFAC Specially Designated Nationals (SDN)
// list. Mirrors Bubble 9's voice_recording_consent_state_resolved pattern: the
// Scope Contract's static composite_checks[].input carries no issuance-time
// parameters; BOTH runtime inputs ride the AuthZEN request's action.properties
// and are read here via ctx.action_properties (see lib/authzen/eval-context.ts).
//
// Inputs (action_properties):
//   - regulatory_state.ofac_sdn_list : string[]  canonical SDN entity identifiers
//   - entity.id                      : string    the entity under review
//
// Outcomes (fail-safe; isAllowable permits pass-only):
//   - either input absent/malformed → STUB    (unresolved; "waiting on regulatory
//                                               feed" — blocks allow, so no action
//                                               proceeds against an unverified list)
//   - entity.id ∈ ofac_sdn_list      → FAIL    (sanctioned counterparty; hard deny)
//   - entity.id substring-matches an
//     SDN entry's region token        → REVIEW  (possible match; blocks pending
//                                               human review — Bubble 16 three-state)
//   - entity.id otherwise clean       → PASS    (permit)
//
// NOTE on the unresolved sentinel: 'stub' is the dispatch registry's established
// not-yet-wired/unresolvable result (CompositeResult; isAllowable blocks it, same
// as the Bubble 1-3 deferred stubs). This predicate is REAL on its pass/fail
// arcs and only returns 'stub' when a runtime input is absent — the "waiting on
// regulatory feed" state the dashboard renders before the SDN list is injected.
//
// Anchor case: OFAC v. TradeStation Securities (Mar 17 2026, $1.11M, 481
// violations across 8 months of silent control failure). The receipt records a
// fingerprint of the SDN snapshot checked (sha256 of the canonical sorted join +
// the entry count) rather than the full list, so a reader can see WHICH snapshot
// a decision was made against without embedding the list in every receipt.
//
// v0.2 stub assumption: ofac_sdn_list is pre-normalized; exact match is a hard
// hit and a region-token substring match is a possible match that routes to human
// review. This mirrors the standard sanctions-screening workflow (exact → block,
// fuzzy → analyst review). The Bright Data-wired v0.3 version replaces the
// substring stub with real fuzzy resolution (Levenshtein / phonetic / alias).

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';
import { sha256Hex } from '@/lib/compliance/receipt/hash';

// No issuance-time parameters: both inputs ride the request at runtime via
// action.properties. The contract still supplies an (empty) input object so the
// dispatcher's inputSchema validation has an object to validate against.
type EntityNotSanctionedInput = Record<string, never>;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const PREDICATE_NAME = 'entity_not_sanctioned';

interface SdnFingerprint {
  algo: 'sha256';
  hash: string;
  length: number;
}

/** Reads action_properties.regulatory_state.ofac_sdn_list; null if absent/malformed. */
function readSdnList(props: Record<string, unknown> | undefined): string[] | null {
  const reg = props?.['regulatory_state'];
  if (typeof reg !== 'object' || reg === null) return null;
  const list = (reg as Record<string, unknown>)['ofac_sdn_list'];
  if (!Array.isArray(list) || !list.every((e) => typeof e === 'string')) return null;
  return list as string[];
}

/** Reads action_properties.entity.id; null if absent/malformed. */
function readEntityId(props: Record<string, unknown> | undefined): string | null {
  const entity = props?.['entity'];
  if (typeof entity !== 'object' || entity === null) return null;
  const id = (entity as Record<string, unknown>)['id'];
  if (typeof id !== 'string' || id.length === 0) return null;
  return id;
}

// Distinctive region/country tokens that identify an SDN entry's jurisdiction.
// Bubble 16 substring-match stub: an entity whose id CONTAINS one of these tokens
// (and the token is present in the active SDN snapshot) is a possible match that
// routes to human review. v0.3 replaces this with real fuzzy matching.
const SDN_REGION_TOKENS: readonly string[] = [
  'IRAN',
  'CRIMEA',
  'DPRK',
  'NKOREA',
  'SYRIA',
  'CUBA',
  'RUSSIA',
];

/**
 * Region tokens actually present in THIS SDN snapshot, each mapped to the entry it
 * was extracted from (split on '-'), so a receipt can cite which SDN entry drove a
 * possible match. Only tokens in both the allowlist AND the snapshot are indexed —
 * an entity matching a region not on the current list is NOT flagged.
 */
function regionTokenIndex(sdnList: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of sdnList) {
    const parts = entry.toUpperCase().split('-');
    for (const token of SDN_REGION_TOKENS) {
      if (!index.has(token) && parts.includes(token)) index.set(token, entry);
    }
  }
  return index;
}

/**
 * First region token (allowlist order, for determinism) that appears as a
 * substring of entityId AND is present in the snapshot. null when none match.
 */
function findRegionSubstringMatch(
  entityId: string,
  index: Map<string, string>,
): { token: string; sdnEntry: string } | null {
  const haystack = entityId.toUpperCase();
  for (const token of SDN_REGION_TOKENS) {
    const sdnEntry = index.get(token);
    if (sdnEntry !== undefined && haystack.includes(token)) {
      return { token, sdnEntry };
    }
  }
  return null;
}

/**
 * Fingerprint of the SDN snapshot: sha256 over the canonical (ascending-sorted,
 * newline-joined) entries, plus the entry count. Lets a receipt cite WHICH list
 * was checked without embedding the full list.
 */
function fingerprintSdnList(list: string[]): SdnFingerprint {
  const canonical = [...list].sort().join('\n');
  return {
    algo: 'sha256',
    hash: sha256Hex(Buffer.from(canonical, 'utf-8')),
    length: list.length,
  };
}

export const entityNotSanctionedPredicate: CompositePredicate<EntityNotSanctionedInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(_input, ctx): Promise<CompositePredicateEvaluation> {
    const sdnList = readSdnList(ctx.action_properties);
    const entityId = readEntityId(ctx.action_properties);

    // Outcome 1 — unresolved: either runtime input is absent/malformed. Record
    // exactly what's missing so the dashboard can render "waiting on regulatory
    // feed". Fail-safe: stub blocks allow.
    if (sdnList === null || entityId === null) {
      const missing: string[] = [];
      if (sdnList === null) missing.push('regulatory_state.ofac_sdn_list');
      if (entityId === null) missing.push('entity.id');
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: `entity_not_sanctioned unresolved: waiting on regulatory feed (missing: ${missing.join(', ')})`,
        details: {
          unresolved: true,
          missing,
          entity_id: entityId,
          reasons: [
            'OFAC SDN screening could not resolve: one or both runtime inputs absent/malformed',
            'PRE-scaffold: live OFAC SDN feed via Bright Data not yet wired; inject ofac_sdn_list to resolve',
            'fail-safe: unresolved blocks allow — no action proceeds against an unverified list',
          ],
        },
      };
    }

    const fingerprint = fingerprintSdnList(sdnList);

    // Outcome 2 — sanctioned: entity.id is on the SDN list → deny. Record the
    // matched entry and the snapshot fingerprint.
    if (sdnList.includes(entityId)) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `entity ${entityId} is present on the OFAC SDN list; action must not proceed`,
        details: {
          entity_id: entityId,
          matched_entry: entityId,
          sdn_list_fingerprint: fingerprint,
          reasons: [
            'counterparty/target entity matched an entry on the injected OFAC SDN list',
            'fail-safe sanctions policy blocks the action before execution',
          ],
        },
      };
    }

    // Outcome 2b — possible match (Bubble 16): entity.id is not an exact hit but
    // contains the distinctive region/country token of an SDN entry → review.
    // Blocks pending human review (isAllowable treats review like fail/stub). The
    // matched substring + source SDN entry are recorded so an analyst sees exactly
    // why it was held. v0.2 substring stub; v0.3 swaps in real fuzzy matching.
    const possibleMatch = findRegionSubstringMatch(entityId, regionTokenIndex(sdnList));
    if (possibleMatch) {
      return {
        predicate: PREDICATE_NAME,
        result: 'review',
        reason: `entity ${entityId} possibly matches the OFAC SDN list (substring "${possibleMatch.token}" against SDN entry ${possibleMatch.sdnEntry}); blocking pending analyst review`,
        details: {
          entity_id: entityId,
          matched_entry: null,
          possible_match: true,
          matched_substring: possibleMatch.token,
          matched_against: possibleMatch.sdnEntry,
          sdn_list_fingerprint: fingerprint,
          reasons: [
            `counterparty/target entity contains the region token "${possibleMatch.token}" extracted from SDN entry ${possibleMatch.sdnEntry}`,
            'fail-safe sanctions policy holds the action pending human review (possible match, not an exact SDN hit)',
            'v0.2 substring-match stub: v0.3 replaces this with fuzzy matching (Levenshtein / phonetic / alias resolution)',
          ],
        },
      };
    }

    // Outcome 3 — clean: entity.id is not on the SDN list → permit. Record the
    // entity checked and the snapshot fingerprint it was checked against.
    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: `entity ${entityId} is not on the OFAC SDN list (snapshot ${fingerprint.hash.slice(0, 12)}…, ${fingerprint.length} entries)`,
      details: {
        entity_id: entityId,
        matched_entry: null,
        sdn_list_fingerprint: fingerprint,
        reasons: ['counterparty/target entity cleared against the injected OFAC SDN list'],
      },
    };
  },
};
