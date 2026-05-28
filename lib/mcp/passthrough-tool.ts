// bd_mcp_passthrough tool logic (Bubble 20 Phase B), decoupled from the MCP SDK
// transport so it is unit-testable. governMCPCall gates the call; on permit we forward
// the tools/call to Bright Data's hosted MCP server and fingerprint the response into a
// BDCallAudit entry. The governed wrapper tool is identified as bd_mcp_passthrough; the
// actual BD tool requested rides in parameters.bd_tool_name (gated by the allowlist
// composite and recorded in the audit). bdMcpPassthroughCall is injectable for tests.

import { governMCPCall } from './govern';
import { bdMcpPassthroughCall } from '@/lib/bd/mcp-passthrough-client';
import { sha256Hex } from '@/lib/compliance/receipt/hash';
import type { BDCallAudit } from '@/types/authzen';

const SERVICE = 'mcp_server' as const;
const TOOL = 'bd_mcp_passthrough';

export interface BdMcpPassthroughArgs {
  agent_id: string;
  /** The Bright Data MCP tool to forward to (e.g. 'search_engine'). */
  bd_tool_name: string;
  /** Arguments forwarded verbatim to the BD MCP tool. */
  bd_tool_input?: Record<string, unknown>;
  /** Declared purpose, matched against the bd_permissions rule. */
  purpose: string;
  /** subject.type for the agent-contract-map type-name fallback. */
  subject_type?: string;
}

export interface PassthroughToolDeps {
  passthrough?: typeof bdMcpPassthroughCall;
}

export interface PassthroughToolResult {
  ok: boolean;
  denied: boolean;
  reason: string | null;
  bd_call: BDCallAudit;
  /** BD's MCP tool result on success; null when denied or execution failed. */
  results: unknown | null;
}

export async function runBdMcpPassthrough(
  args: BdMcpPassthroughArgs,
  deps: PassthroughToolDeps = {},
): Promise<PassthroughToolResult> {
  const passthrough = deps.passthrough ?? bdMcpPassthroughCall;
  const parameters: Record<string, unknown> = {
    purpose: args.purpose,
    bd_tool_name: args.bd_tool_name,
    bd_tool_input: args.bd_tool_input ?? {},
  };

  const gov = await governMCPCall({
    agent_id: args.agent_id,
    service: SERVICE,
    tool: TOOL,
    parameters,
    subject_type: args.subject_type,
  });
  const composite_outcomes = gov.composite_outcomes.map((o) => ({
    composite: o.predicate,
    result: o.result,
  }));

  if (!gov.permit) {
    return {
      ok: false,
      denied: true,
      reason: gov.reason,
      results: null,
      bd_call: {
        service: SERVICE,
        tool: TOOL,
        parameters,
        matched_rule_id: gov.matched_rule_id,
        governance_result: 'deny',
        composite_outcomes,
        executed_at: null,
        duration_ms: null,
        response_sha256: null,
        response_size_bytes: null,
        bd_request_id: null,
      },
    };
  }

  const executedAt = new Date();
  const t0 = Date.now();
  try {
    const out = await passthrough({ bd_tool_name: args.bd_tool_name, bd_tool_input: args.bd_tool_input });
    return {
      ok: true,
      denied: false,
      reason: null,
      results: out.results,
      bd_call: {
        service: SERVICE,
        tool: TOOL,
        parameters,
        matched_rule_id: gov.matched_rule_id,
        governance_result: 'permit',
        composite_outcomes,
        executed_at: executedAt.toISOString(),
        duration_ms: Date.now() - t0,
        response_sha256: sha256Hex(Buffer.from(out.raw, 'utf-8')),
        response_size_bytes: Buffer.byteLength(out.raw, 'utf-8'),
        bd_request_id: out.bd_request_id,
      },
    };
  } catch (err) {
    // Governance permitted but the BD MCP call failed. Record the attempt for audit.
    return {
      ok: false,
      denied: false,
      reason: `BD MCP passthrough call failed: ${(err as Error).message}`,
      results: null,
      bd_call: {
        service: SERVICE,
        tool: TOOL,
        parameters,
        matched_rule_id: gov.matched_rule_id,
        governance_result: 'permit',
        composite_outcomes,
        executed_at: executedAt.toISOString(),
        duration_ms: Date.now() - t0,
        response_sha256: null,
        response_size_bytes: null,
        bd_request_id: null,
      },
    };
  }
}
