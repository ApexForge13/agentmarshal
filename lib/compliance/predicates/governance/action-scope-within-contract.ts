// Action-scope-within-contract composite predicate (REAL, not stub).
// Verifies that the requested action_name is listed in the contract's
// declared_scope of allowed actions. A request whose action_name is outside
// the declared set fails — independent of any other rule match.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface ActionScopeInput {
  action_name: string;
  declared_scope: string[];
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['action_name', 'declared_scope'],
  properties: {
    action_name: { type: 'string', minLength: 1 },
    declared_scope: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'action_scope_within_contract';

export const actionScopeWithinContractPredicate: CompositePredicate<ActionScopeInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    const allowed = input.declared_scope.includes(input.action_name);

    if (!allowed) {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: `action '${input.action_name}' is not in the contract's declared_scope`,
        details: {
          action_name: input.action_name,
          declared_scope: input.declared_scope,
        },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'pass',
      reason: `action '${input.action_name}' is within declared_scope`,
      details: { action_name: input.action_name },
    };
  },
};
