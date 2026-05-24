// GET /api/verify/public-key
//
// Publishes AgentMarshal's single global Ed25519 public key so anyone can
// verify a Compliance Receipt / Internal Audit envelope without trusting
// Marshal at all. Returns the key as both raw hex and a JWK (kty OKP / Ed25519),
// plus the key_id + fingerprint that receipts embed.

import { NextResponse } from 'next/server';
import { loadPublicKey } from '@/lib/verify/load-public-key';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const { info } = await loadPublicKey();
    return NextResponse.json(info, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'failed to load public key', details: (err as Error).message ?? 'unknown' },
      { status: 500 },
    );
  }
}
