// bd_domain_in_scope composite predicate (Bubble 18).
//
// A governance check for bd_permissions rules that carry a URL allowlist (e.g. the
// Web Unlocker adverse-media rule). Passes when the BD call's `url` parameter has a
// hostname inside the matched rule's declared match.parameters.url.domain_in list.
// It is an explicit, audited parallel to the match-level domain_in check in
// lib/mcp/govern.ts — it records a bd_domain_in_scope entry in the composite_outcomes
// trail. Runtime state rides ctx.action_properties, threaded by lib/mcp/govern.ts:
//
//   action_properties.bd_call          : { service, tool, parameters: { url } }
//   action_properties.bd_matched_rule  : the bd_permissions rule being evaluated
//
// Wildcard semantics: '*.reuters.com' matches any subdomain (www.reuters.com,
// news.reuters.com) but NOT the apex 'reuters.com' (declare the apex explicitly if
// needed). A bare 'host.example' matches only that exact hostname. (This is
// deliberately stricter on the apex than govern.ts's match-level helper, which also
// matches the apex; the composite is the conservative, audited layer.)
//
// Outcomes (fail-safe; isAllowable permits pass-only):
//   - bd_call.parameters.url or the rule's domain_in allowlist absent → STUB
//   - url not parseable as a URL                                      → FAIL
//   - hostname matches a domain_in pattern                            → PASS
//   - otherwise                                                       → FAIL

import type {
  CompositePredicate,
  CompositePredicateEvaluation,
} from '@/lib/authzen/composite-dispatch';

type BdDomainInScopeInput = Record<string, never>;

const INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const PREDICATE_NAME = 'bd_domain_in_scope';

/** Reads action_properties.bd_call.parameters.url; null if absent/malformed. */
function readCallUrl(props: Record<string, unknown> | undefined): string | null {
  const call = props?.['bd_call'];
  if (typeof call !== 'object' || call === null) return null;
  const params = (call as Record<string, unknown>)['parameters'];
  if (typeof params !== 'object' || params === null) return null;
  const url = (params as Record<string, unknown>)['url'];
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/** Reads bd_matched_rule.match.parameters.url.domain_in; null if absent/malformed/empty. */
function readDomainAllowlist(props: Record<string, unknown> | undefined): string[] | null {
  const rule = props?.['bd_matched_rule'];
  if (typeof rule !== 'object' || rule === null) return null;
  const match = (rule as Record<string, unknown>)['match'];
  const params =
    typeof match === 'object' && match !== null
      ? (match as Record<string, unknown>)['parameters']
      : undefined;
  const url =
    typeof params === 'object' && params !== null
      ? (params as Record<string, unknown>)['url']
      : undefined;
  const domainIn =
    typeof url === 'object' && url !== null
      ? (url as Record<string, unknown>)['domain_in']
      : undefined;
  if (!Array.isArray(domainIn)) return null;
  const patterns = domainIn.filter((p): p is string => typeof p === 'string');
  return patterns.length > 0 ? patterns : null;
}

/** '*.reuters.com' matches subdomains (not the apex); a bare host matches exactly. */
function hostnameInScope(hostname: string, patterns: string[]): boolean {
  const h = hostname.toLowerCase();
  return patterns.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) return h.endsWith(`.${p.slice(2)}`);
    return h === p;
  });
}

export const bdDomainInScopePredicate: CompositePredicate<BdDomainInScopeInput> = {
  name: PREDICATE_NAME,
  inputSchema: INPUT_SCHEMA,
  async evaluate(_input, ctx): Promise<CompositePredicateEvaluation> {
    const url = readCallUrl(ctx.action_properties);
    const allowlist = readDomainAllowlist(ctx.action_properties);

    if (url === null || allowlist === null) {
      const missing: string[] = [];
      if (url === null) missing.push('bd_call.parameters.url');
      if (allowlist === null) missing.push('bd_matched_rule.match.parameters.url.domain_in');
      return {
        predicate: PREDICATE_NAME,
        result: 'stub',
        reason: `bd_domain_in_scope unresolved (missing: ${missing.join(', ')})`,
        details: {
          unresolved: true,
          missing,
          reasons: ['BD domain scope could not resolve: required runtime state absent'],
        },
      };
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return {
        predicate: PREDICATE_NAME,
        result: 'fail',
        reason: 'url parameter is not a valid URL',
        details: {
          url,
          domain_in: allowlist,
          reasons: ['BD call url parameter is not a parseable URL'],
        },
      };
    }

    if (hostnameInScope(hostname, allowlist)) {
      return {
        predicate: PREDICATE_NAME,
        result: 'pass',
        reason: `hostname ${hostname} matches the declared domain_in allowlist`,
        details: { hostname, domain_in: allowlist },
      };
    }

    return {
      predicate: PREDICATE_NAME,
      result: 'fail',
      reason: `hostname ${hostname} not in declared domain_in allowlist`,
      details: {
        hostname,
        domain_in: allowlist,
        reasons: ['BD call url hostname is not in the matched rule domain_in allowlist'],
      },
    };
  },
};
