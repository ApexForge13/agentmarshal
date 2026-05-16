// POST /api/ambient-fire
//
// Body: { scenario: ScenarioKind }
// Runs a single scenario through the same pipeline as /api/demo-trigger
// (real LT call, real policy eval, real audit row). The dashboard hits this
// every ~10s with a rotating GREEN scenario so the activity feed never goes
// quiet, even when nobody clicked Run demo.

import { NextResponse } from 'next/server';

import { runScenario, type ScenarioRunResult } from '@/lib/scenario-runner';
import { SCENARIOS, type ScenarioKind } from '@/lib/agents/scenarios';

export const runtime = 'nodejs';

interface AmbientFireBody {
  scenario?: unknown;
}

function isScenarioKind(v: unknown): v is ScenarioKind {
  return typeof v === 'string' && v in SCENARIOS;
}

type ResultEntry = ScenarioRunResult | { scenarioId: ScenarioKind; error: string };

export async function POST(request: Request) {
  let body: AmbientFireBody | null = null;
  try {
    body = (await request.json()) as AmbientFireBody | null;
  } catch {
    return NextResponse.json(
      { error: 'request body must be JSON with a `scenario` field' },
      { status: 400 },
    );
  }

  if (!body || !isScenarioKind(body.scenario)) {
    return NextResponse.json(
      { error: 'request body must include `scenario` as a known ScenarioKind' },
      { status: 400 },
    );
  }

  const scenarioId = body.scenario;
  let result: ResultEntry;
  try {
    result = await runScenario(scenarioId);
  } catch (err) {
    const raw = (err as Error).message ?? 'unknown error';
    const error =
      raw.toLowerCase().includes('unreachable') ||
      raw.toLowerCase().includes('fetch failed')
        ? 'Lobster Trap unreachable'
        : raw;
    result = { scenarioId, error };
  }

  return NextResponse.json({ result }, { status: 200 });
}
