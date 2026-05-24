// POST /api/verify/receipt
//
// Body: { receipt: <any JSON object> }. Verifies the Ed25519 signature against
// the published public key and returns a structured verdict. Reuses the same
// JCS canonicalization + Ed25519 verify as receipt emission (lib/verify).

import { NextResponse } from 'next/server';
import { verifyReceipt } from '@/lib/verify/verify-receipt';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('receipt' in body)) {
    return NextResponse.json({ error: 'request must be { receipt: <object> }' }, { status: 400 });
  }

  const receipt = (body as { receipt: unknown }).receipt;
  if (typeof receipt !== 'object' || receipt === null || Array.isArray(receipt)) {
    return NextResponse.json({ error: 'receipt must be a JSON object' }, { status: 400 });
  }

  try {
    const result = await verifyReceipt(receipt);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'verification failed', details: (err as Error).message ?? 'unknown' },
      { status: 500 },
    );
  }
}
