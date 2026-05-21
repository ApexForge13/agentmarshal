// CAN-SPAM physical postal address composite predicate.
// 15 USC §7704(a)(5)(A)(iii): commercial messages must include a valid physical postal address.
// US-format match: "City, ST ZIP[-PLUS4]".

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface PostalAddressInput {
  email_body: string;
  sender_postal_address?: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['email_body'],
  properties: {
    email_body: { type: 'string' },
    sender_postal_address: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'canspam_postal_address_present';
// City Name, STATE ZIP[-PLUS4]. Case-insensitive.
const US_ADDRESS_RE = /\b[A-Z0-9 .,'-]+,\s*[A-Z]{2}\s+\d{5}(-\d{4})?\b/i;

export const postalAddressPredicate: CompositePredicate<PostalAddressInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    if (typeof input.sender_postal_address === 'string') {
      if (US_ADDRESS_RE.test(input.sender_postal_address)) {
        return {
          predicate: PREDICATE_NAME,
          result: 'pass',
          reason: 'sender_postal_address is present and well-formed (US format)',
          details: {
            source: 'sender_postal_address',
            sender_postal_address: input.sender_postal_address,
          },
        };
      }
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: 'sender_postal_address is present but not in recognized US format',
        details: {
          source: 'sender_postal_address',
          sender_postal_address: input.sender_postal_address,
        },
      };
    }

    if (US_ADDRESS_RE.test(input.email_body)) {
      const match = input.email_body.match(US_ADDRESS_RE);
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: 'physical postal address found in email_body (US format)',
        details: {
          source: 'email_body',
          matched_address: match?.[0],
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: 'no physical postal address found in sender_postal_address or email_body',
      details: { had_sender_postal_address: false },
    };
  },
};
