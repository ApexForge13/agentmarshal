// SMS express-written-consent composite predicate.
// TCPA 47 CFR §64.1200(f)(8) requires prior express written consent for
// marketing SMS to a wireless number: the recipient signs an agreement
// (E-SIGN Act electronic signatures qualify) that identifies the seller
// and grants consent to receive ads via SMS to the specified wireless
// number. The SMS marketing surface is deferred to v0.3 per agents.md
// §3.6 / §7.4; there is no SMS-touching code path in v0.2 for this
// predicate to gate.
// Bubble 5b stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SmsExpressWrittenConsentInput {
  /** Wireless number that would receive the marketing SMS (E.164 preferred). */
  recipient_phone: string;
  /** Identifier of the seller named in the express written consent agreement. */
  seller_id: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['recipient_phone', 'seller_id'],
  properties: {
    recipient_phone: { type: 'string', minLength: 1 },
    seller_id: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'sms_express_written_consent_recorded';

export const smsExpressWrittenConsentRecordedPredicate: CompositePredicate<SmsExpressWrittenConsentInput> =
  {
    name: PREDICATE_NAME,
    inputSchema: INPUT_SCHEMA,
    async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: 'SMS express-written-consent lookup not yet implemented',
        details: {
          recipient_phone: input.recipient_phone,
          seller_id: input.seller_id,
          would_check:
            'signed_express_written_consent_record_exists_identifying_seller_and_granting_sms_marketing_consent_47_cfr_64_1200_f_8',
          deferred_to: 'SMS surface (v0.3)',
        },
      };
    },
  };
