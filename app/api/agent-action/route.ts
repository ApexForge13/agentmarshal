// POST /api/agent-action
//
// Body: { scenarioId: 'GREEN' | 'YELLOW' | 'RED' }
// Runs the scenario through LT + policy engine, writes an audit row, and
// returns { scenarioId, decision, auditId }.

import { NextResponse } from 'next/server';

import { runScenario } from '@/lib/scenario-runner';
import type { ScenarioKind } from '@/lib/agents/scenarios';

export const runtime = 'nodejs';

const VALID_SCENARIOS: ScenarioKind[] = ['GREEN', 'YELLOW', 'RED'];

function isScenarioKind(value: unknown): value is ScenarioKind {
  return (
    typeof value === 'string' &&
    (VALID_SCENARIOS as string[]).includes(value)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Missing or invalid scenarioId' },
      { status: 400 },
    );
  }

  const scenarioId =
    body && typeof body === 'object'
      ? (body as { scenarioId?: unknown }).scenarioId
      : undefined;

  if (!isScenarioKind(scenarioId)) {
    return NextResponse.json(
      { error: 'Missing or invalid scenarioId' },
      { status: 400 },
    );
  }

  try {
    const result = await runScenario(scenarioId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown error';
    if (
      message.toLowerCase().includes('unreachable') ||
      message.toLowerCase().includes('fetch failed')
    ) {
      return NextResponse.json(
        { error: 'Lobster Trap unreachable' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
