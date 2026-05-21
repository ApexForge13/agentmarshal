// CAN-SPAM subject-line deception composite predicate.
// 15 USC §7704(a)(2): commercial messages must not have materially false or
// misleading subject lines. Heuristic checks for the most common deceptive
// patterns: empty subjects, fake reply/forward markers, scam phrases, and
// excessive ALL-CAPS.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SubjectDeceptionInput {
  subject: string;
  has_prior_thread?: boolean;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['subject'],
  properties: {
    subject: { type: 'string' },
    has_prior_thread: { type: 'boolean' },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'canspam_subject_line_not_deceptive';
const FAKE_REPLY_RE = /^\s*(re|fwd?):\s/i;
const SCAM_PHRASES: RegExp[] = [
  /\byou\s+won\b/i,
  /\bclaim\s+your\s+prize\b/i,
  /\bguaranteed\s+(win|money|cash|income)\b/i,
  /\bfree\s+money\b/i,
  /\bact\s+now\s+or\s+lose\b/i,
  /\bfinal\s+notice\b/i,
];

export const subjectDeceptionPredicate: CompositePredicate<SubjectDeceptionInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const subject = input.subject.trim();

    if (subject.length === 0) {
      return fail('subject is empty — deceptive by omission', { detected: 'empty_subject' });
    }

    if (FAKE_REPLY_RE.test(subject) && !input.has_prior_thread) {
      return fail('subject uses Re:/Fwd: prefix with no prior thread', {
        detected: 'fake_reply_marker',
        subject,
      });
    }

    for (const pattern of SCAM_PHRASES) {
      const match = subject.match(pattern);
      if (match) {
        return fail(`subject contains scam phrase "${match[0]}"`, {
          detected: 'scam_phrase',
          matched_phrase: match[0],
          subject,
        });
      }
    }

    if (isExcessivelyCaps(subject)) {
      return fail('subject is excessively capitalized (>70% uppercase letters)', {
        detected: 'all_caps',
        subject,
      });
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: 'subject does not match known deceptive patterns',
      details: { subject },
    };
  },
};

function fail(reason: string, details: Record<string, unknown>): CompositePredicateEvaluation {
  return { predicate: PREDICATE_NAME, result: 'fail', reason, details };
}

function isExcessivelyCaps(subject: string): boolean {
  const letters = subject.match(/[A-Za-z]/g) ?? [];
  if (letters.length < 6) return false;
  const upper = letters.filter((c) => c === c.toUpperCase()).length;
  return upper / letters.length > 0.7;
}
