// POST /api/access/v1/evaluation
//
// AuthZEN-compatible Policy Decision Point endpoint.
// Day 3: real Scope Contract evaluator (Bubble 2) replaces Day 2 stub.
// Day 4-5: real audit-record schema columns + ed25519 signing.
import { NextResponse } from 'next/server';
import { validateAuthZenRequest } from '@/lib/authzen/schema-validator';
import { evaluateRequest, toAuthZenResponse } from '@/lib/authzen/evaluate';
import { loadContractForAgent } from '@/lib/authzen/contracts';
import { recordEvaluation } from '@/lib/authzen/audit';
import type { AuthZenRequest } from '@/types/authzen';

export const runtime = 'nodejs';

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

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'AuthZEN evaluation failed', details: (err as Error).message ?? 'unknown' },
      { status: 500 }
    );
  }
}
