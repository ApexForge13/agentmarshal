// Transcript → StateTransition detection (Bubble 9).
//
// SAMPLE AGENT — demo-grade keyword/regex matching, NOT production NLU.
// Deliberately tight: a false-positive consent_revoked is the bug that tanks
// the demo, so the keyword set is minimal and anchored. Production (echo-os)
// would use the LLM's structured intent output, not regex.

import type { StateTransition, StateTransitionType } from './types';

// Ordered by priority: consent_revoked is checked first so an utterance that
// somehow trips multiple buckets is treated as a revocation (fail-safe).
const RULES: Array<{ type: StateTransitionType; patterns: RegExp[] }> = [
  {
    type: 'consent_revoked',
    patterns: [
      /\bstop recording\b/i,
      /\bdon'?t record\b/i,
      /\bdo not record\b/i,
      /\btake me off\b/i,
      /\bremove me\b/i,
      /\boff your list\b/i,
    ],
  },
  {
    type: 'consent_granted',
    patterns: [
      /\byes,? you can record\b/i,
      /\bgo ahead and record\b/i,
      /\bfine to record\b/i,
    ],
  },
  {
    type: 'caller_ending',
    patterns: [
      /\bgoodbye\b/i,
      /\bbye now\b/i,
      /\bhang up\b/i,
      /\bi have to go\b/i,
      /\bgotta go\b/i,
    ],
  },
];

/**
 * Detect a state transition in a single caller utterance. Returns the first
 * matching transition (priority order above) or null. Case-insensitive.
 *
 * Guard cases that must NOT trigger consent_revoked:
 *   "I'm recording this for myself"  — "recording" alone is not a trigger
 *   "Can you record the appointment" — "record" without a negation/removal verb
 */
export function detectTransition(utterance: string): StateTransition | null {
  if (!utterance || !utterance.trim()) return null;

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const m = utterance.match(pattern);
      if (m) {
        return { type: rule.type, matched: m[0], utterance };
      }
    }
  }
  return null;
}
