// GET /api/audit
//
// Query params (all optional):
//   ?agentId=<id>
//   ?action=ALLOW|HUMAN_REVIEW|DENY
//   ?limit=<n>      default 100, clamped to [1, 500]
//
// Returns { entries: AuditEntry[] } newest-first (audit-log.query default).

import { NextResponse } from 'next/server';

import { query, type QueryFilters } from '@/lib/audit-log';
import type { Action } from '@/types';

export const runtime = 'nodejs';

const VALID_ACTIONS: Action[] = ['ALLOW', 'HUMAN_REVIEW', 'DENY'];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function isAction(value: string): value is Action {
  return (VALID_ACTIONS as string[]).includes(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters: QueryFilters = {};

  const agentId = searchParams.get('agentId');
  if (agentId) filters.agentId = agentId;

  const action = searchParams.get('action');
  if (action && isAction(action)) {
    filters.action = action;
  }

  const limitRaw = searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }
  filters.limit = limit;

  try {
    const entries = query(filters);
    return NextResponse.json({ entries }, { status: 200 });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
