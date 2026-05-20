// POST /api/access/v1/evaluation
//
// AuthZEN-compatible Policy Decision Point endpoint.
// Path follows OpenID AuthZEN 1.0 (canonical /access/v1/evaluation), prefixed /api by Next.js.
// Canonical-path rewrite (/access/v1/evaluation → /api/access/v1/evaluation) deferred to next.config.ts follow-up.
//
// Day 2 (this scaffold): stub evaluator returns allow; minimal audit record emitted.
// Day 3: real Scope Contract evaluator.
// Day 4-5: full audit-record schema columns + ed25519 signing.
import { NextResponse } from 'next/server';
import { validateAuthZenRequest } from '@/lib/authzen/schema-validator';
import { evaluateRequest, toAuthZenResponse } from '@/lib/authzen/evaluate';
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
    const result = await evaluateRequest(body as AuthZenRequest);
    const response = toAuthZenResponse(result);

    try {
      recordEvaluation({ request: body as AuthZenRequest, response, result, evaluatedAt });
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
