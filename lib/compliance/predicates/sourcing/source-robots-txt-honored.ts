// Sourcing robots.txt-honored composite predicate.
// Bright Data integration day wires real robots.txt cache
// to confirm direct scrapes respect each origin's robots directives.
// Bubble 1 stub: returns `result: 'stub'`. Fail-safe policy blocks `allow`.

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

interface SourceRobotsTxtInput {
  /** Source URL whose origin's robots.txt should be consulted. */
  source_url: string;
}

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['source_url'],
  properties: {
    source_url: { type: 'string', format: 'uri' },
  },
  additionalProperties: false,
};

const PREDICATE_NAME = 'source_robots_txt_honored';

export const sourceRobotsTxtHonoredPredicate: CompositePredicate<SourceRobotsTxtInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(input, _ctx): Promise<CompositePredicateEvaluation> {
    return {
      predicate: PREDICATE_NAME,
      result: 'stub',
      reason: 'robots.txt cache + path check not yet implemented',
      details: {
        source_url: input.source_url,
        would_check: 'origin_robots_txt_allows_path_for_user_agent',
        deferred_to: 'Bright Data integration day (robots.txt cache)',
      },
    };
  },
};
