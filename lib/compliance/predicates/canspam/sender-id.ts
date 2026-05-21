// CAN-SPAM truthful sender identification composite predicate.
// 15 USC §7704(a)(1): From-header address must be one the sender is authorized to use.
// Extracts the address from the From-header (angle-bracketed form preferred) and
// compares case-insensitively against an authorized_senders list supplied by the caller.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SenderIdInput {
  from_header: string;
  authorized_senders: string[];
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['from_header', 'authorized_senders'],
  properties: {
    from_header: { type: 'string', minLength: 1 },
    authorized_senders: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'canspam_sender_id_truthful';

export const senderIdPredicate: CompositePredicate<SenderIdInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const extracted = extractAddress(input.from_header);

    if (input.authorized_senders.length === 0) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: 'authorized_senders list is empty; no sender can be verified',
        details: { extracted_address: extracted, from_header: input.from_header },
      };
    }

    const normalized = extracted.toLowerCase();
    const matched = input.authorized_senders.find((s) => s.toLowerCase() === normalized);

    if (matched) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `from-header address matches an authorized sender`,
        details: {
          extracted_address: extracted,
          authorized_match: matched,
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: `from-header address ${extracted} is not in authorized_senders`,
      details: {
        extracted_address: extracted,
        from_header: input.from_header,
        authorized_senders_count: input.authorized_senders.length,
      },
    };
  },
};

function extractAddress(fromHeader: string): string {
  const bracketed = fromHeader.match(/<([^>]+)>/);
  if (bracketed) return bracketed[1].trim();
  return fromHeader.trim();
}
