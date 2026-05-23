// POST /api/access/v1/evaluation
//
// AuthZEN-compatible Policy Decision Point endpoint.
// Day 3: real Scope Contract evaluator (Bubble 2) replaces Day 2 stub.
// Day 4-5: real audit-record schema columns + ed25519 signing.
// Day 5 Bubble 6: signed Compliance Receipt or Internal Audit envelope
//   emitted on every evaluation and attached to the response under `record`.
//   Emission type is selected by subject.type via emissionTypeFor() per
//   spec/v0.1/agents.md §1. Chain tracking (previous_*_hash) is deferred —
//   set to null on every record until a chain-state store lands.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { validateAuthZenRequest } from '@/lib/authzen/schema-validator';
import { evaluateRequest, toAuthZenResponse } from '@/lib/authzen/evaluate';
import { loadContractForAgent } from '@/lib/authzen/contracts';
import { recordEvaluation } from '@/lib/authzen/audit';
import { buildReceipt } from '@/lib/compliance/receipt/builder';
import { buildInternalAuditRecord } from '@/lib/compliance/internal-audit/builder';
import { FileKeyProvider } from '@/lib/compliance/keys/file-provider';
import {
  emissionTypeFor,
  isKnownAgentType,
  UNKNOWN_AGENT_TYPE_FALLBACK,
} from '@/lib/access/emission-policy';
// Side-effect imports: register all 37 composite predicates with the dispatch
// registry (12 TCPA/CAN-SPAM real + 20 deferred stubs + 5 governance real).
import '@/lib/compliance/predicates/tcpa';
import '@/lib/compliance/predicates/canspam';
import '@/lib/compliance/predicates/sourcing';
import '@/lib/compliance/predicates/operational';
import '@/lib/compliance/predicates/voice';
import '@/lib/compliance/predicates/sms';
import '@/lib/compliance/predicates/governance';
import type { AuthZenRequest, ScopeContract, EvaluationResult } from '@/types/authzen';
import type { AgentType } from '@/lib/compliance/internal-audit/types';

export const runtime = 'nodejs';

const keyProvider = new FileKeyProvider();

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const validation = validateAuthZenRequest(body);
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'AuthZEN request shape invalid', details: validation.errors },
      { status: 400 }
    );
  }

  try {
    const evaluatedAt = new Date();
    const authzenRequest = body as AuthZenRequest;
    const contract = await loadContractForAgent(authzenRequest.subject.id);
    const result = await evaluateRequest(authzenRequest, contract, { now: evaluatedAt });
    const response = toAuthZenResponse(result);

    try {
      recordEvaluation({ request: authzenRequest, response, result, evaluatedAt });
    } catch (err) {
      console.error('AuthZEN audit emission failed:', (err as Error).message);
    }

    const { record_type, body: signedRecord } = await emitSignedRecord({
      request: authzenRequest,
      contract,
      result,
      issuedAt: evaluatedAt,
    });

    // Attach the signed record under `record` with a `record_type` discriminator.
    // For internal-audit envelopes, record_type is also intrinsic to the signed
    // body; the response-level field is a redundant convenience for clients.
    // For Compliance Receipts (whose schema has no record_type field), the
    // response-level field is the only discriminator and is NOT part of the
    // signed bytes — verifiers strip record_type before recomputing the body.
    return NextResponse.json(
      { ...response, record: { record_type, ...signedRecord } },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'AuthZEN evaluation failed', details: (err as Error).message ?? 'unknown' },
      { status: 500 }
    );
  }
}

interface EmissionInput {
  request: AuthZenRequest;
  contract: ScopeContract;
  result: EvaluationResult;
  issuedAt: Date;
}

interface EmittedRecord {
  record_type: 'compliance_receipt' | 'internal_audit';
  body: Record<string, unknown>;
}

async function emitSignedRecord(input: EmissionInput): Promise<EmittedRecord> {
  const evaluationId = randomUUID();
  const requestId = randomUUID();
  const handle = await keyProvider.getActiveSigningHandle();
  const subjectType = input.request.subject.type;
  const emissionType = emissionTypeFor(subjectType);

  if (emissionType === 'compliance_receipt') {
    const receipt = await buildReceipt({
      evaluationResult: input.result,
      tenantId: input.contract.tenant_id ?? 'default',
      agentId: input.request.subject.id,
      contractId: input.contract.contract_id,
      contractVersion: String(input.contract.version ?? '0.1'),
      evaluationId,
      requestId,
      previousReceiptHash: null,
      issuedAt: input.issuedAt,
      signers: [{ handle, role: 'agentmarshal' }],
    });
    return { record_type: 'compliance_receipt', body: receipt as unknown as Record<string, unknown> };
  }

  const agentType: AgentType = isKnownAgentType(subjectType)
    ? subjectType
    : UNKNOWN_AGENT_TYPE_FALLBACK;

  const requestProps = (input.request.action.properties ?? {}) as Record<string, unknown>;
  const actionInputs: Record<string, unknown> = isKnownAgentType(subjectType)
    ? requestProps
    : { ...requestProps, _unrecognized_subject_type: subjectType };

  const internalAudit = await buildInternalAuditRecord({
    evaluationResult: input.result,
    tenantId: input.contract.tenant_id ?? 'default',
    evaluationId,
    requestId,
    agent: {
      id: input.request.subject.id,
      type: agentType,
      version: 'v0.2',
    },
    action: {
      type: input.request.action.name,
      inputs: actionInputs,
      outputs: {},
    },
    contract: {
      id: input.contract.contract_id,
      version: String(input.contract.version ?? '0.1'),
    },
    previousAuditHash: null,
    issuedAt: input.issuedAt,
    signers: [{ handle, role: 'agentmarshal' }],
  });
  return { record_type: 'internal_audit', body: internalAudit as unknown as Record<string, unknown> };
}
