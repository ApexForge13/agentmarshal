// POST /api/demo-trigger
//
// Body: { delayMs?: number } (default 0, clamped to [0, 120000])
// Fires the demo scenario sequence so the operator sees a realistic working-
// day arc: a few clean ALLOWs, a HUMAN_REVIEW (margin floor), another ALLOW,
// then the BEC finale that DENYs. Failures in one scenario do not stop later
// ones — each result (or error) is collected so the dashboard can animate
// partial-success demo runs.

import { NextResponse } from 'next/server';

import { runScenario, type ScenarioRunResult } from '@/lib/scenario-runner';
import type { ScenarioKind } from '@/lib/agents/scenarios';

export const runtime = 'nodejs';

const ORDER: ScenarioKind[] = [
  'GREEN_INVOICE',  // 1. comms routes a clean invoice
  'GREEN_REVIEW',   // 2. follow_up sends review request
  'GREEN',          // 3. voice_scheduling books appointment
  'YELLOW',         // 4. quoting margin floor escalation (modal pops)
  'GREEN_CLAIM',    // 5. claims replies to adjuster (after the YELLOW)
  'RED',            // 6. comms BEC payment redirect (the finale)
];
const MAX_DELAY_MS = 120000;

type ResultEntry = ScenarioRunResult | { scenarioId: ScenarioKind; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  let delayMs = 0;
  try {
    const body = (await request.json()) as { delayMs?: unknown } | null;
    if (body && typeof body.delayMs === 'number' && Number.isFinite(body.delayMs)) {
      delayMs = Math.max(0, Math.min(MAX_DELAY_MS, body.delayMs));
    }
  } catch {
    // Empty / non-JSON body is fine — fall through with delayMs=0.
  }

  const results: ResultEntry[] = [];
  for (let i = 0; i < ORDER.length; i++) {
    const scenarioId = ORDER[i];
    if (i > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    try {
      const result = await runScenario(scenarioId);
      results.push(result);
    } catch (err) {
      const raw = (err as Error).message ?? 'unknown error';
      const error =
        raw.toLowerCase().includes('unreachable') ||
        raw.toLowerCase().includes('fetch failed')
          ? 'Lobster Trap unreachable'
          : raw;
      results.push({ scenarioId, error });
    }
  }

  return NextResponse.json({ results }, { status: 200 });
}
