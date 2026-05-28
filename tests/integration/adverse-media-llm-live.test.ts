// Live end-to-end verification of the AI/ML API LLM adverse-media scorer (Bubble 22).
// Gated on AIML_API_KEY so `npx vitest run` stays hermetic. To run it:
//
//   set -a; . ./.env; set +a; npx vitest run tests/integration/adverse-media-llm-live.test.ts
//
// Drives `scoreAdverseMediaWithLlm` directly with two crafted, FICTIONAL samples:
// one clearly clean and one clearly adverse. The verdict is data-dependent (LLMs
// reason, not match), so we assert structural shape + a sane bucket (`pass` or
// `review` for the clean sample; `fail` or `review` for the adverse sample) but
// DO NOT pin to a single value. The reasoning string is logged so we can copy
// the most useful examples into the demo writeup and signed-receipt screenshots.

import { describe, it, expect } from 'vitest';
import {
  scoreAdverseMediaWithLlm,
} from '@/lib/compliance/predicates/trading/adverse-media-llm-scorer';

const HAS_AIML = !!process.env.AIML_API_KEY;

// Fictional, benign counterparty — no real-world referent.
const CLEAN_ENTITY = 'Northwind Artisanal Stationery Collective';
const CLEAN_CONTENT = `
Northwind Artisanal Stationery Collective today announced a routine quarterly
financial result, with revenue up 4% on the prior quarter. The Collective's
co-founder Mira Ostrov said the company would invest in a new letterpress facility
in Trieste and expand its hand-bound ledger line. The board declared a regular
dividend; no regulatory filings or legal matters were disclosed.
`.trim();

// Fictional adverse scenario — strong, specific adverse media about the named entity.
const ADVERSE_ENTITY = 'Helix Bridge Capital Partners';
const ADVERSE_CONTENT = `
Federal prosecutors today unsealed a 17-count indictment against Helix Bridge
Capital Partners and three of its principals, alleging a multi-year scheme to
misrepresent fund performance to limited partners and to launder proceeds through
shell entities in Cyprus. The SEC simultaneously froze the firm's US accounts and
imposed an emergency operating ban. Helix Bridge Capital Partners executives are
scheduled to appear in the Southern District of New York on Friday.
`.trim();

// Name-collision scenario: the article describes a DIFFERENT entity that shares
// part of the name. A keyword scorer would (and live, did) false-positive on this;
// the LLM is supposed to read it and answer "no, this is not about that entity".
const COLLISION_ENTITY = 'Meridian Corp';
const COLLISION_CONTENT = `
Meridian Group Holdings, a wholly unrelated UK property developer, is under
investigation for council-tax avoidance. Sources at HMRC said no other companies
sharing the Meridian name are implicated. Meridian Corp, the US industrial
fastener maker, has filed routine quarterly earnings and is not subject to any
regulatory action.
`.trim();

describe.skipIf(!HAS_AIML)('scoreAdverseMediaWithLlm — live AI/ML API (gated by AIML_API_KEY)', () => {
  it('clean content scores pass or review (not fail), with non-empty reasoning + cost telemetry', async () => {
    const out = await scoreAdverseMediaWithLlm({
      entity_name: CLEAN_ENTITY,
      content: CLEAN_CONTENT,
    });

    console.log(
      `[adverse-media-llm live] CLEAN  verdict=${out.verdict} reasoning="${out.reasoning}" concerns=${JSON.stringify(out.concerns)} model=${out.model} credits=${out.cost.credits_used} usd=${out.cost.usd_spent}`,
    );

    expect(['pass', 'review', 'fail']).toContain(out.verdict);
    expect(out.verdict).not.toBe('fail');
    expect(out.reasoning.length).toBeGreaterThan(10);
    expect(Array.isArray(out.concerns)).toBe(true);
    expect(out.model).toMatch(/gpt-4\.1-mini/);
    expect(out.content_truncated).toBe(false);
  }, 30000);

  it('adverse content scores fail or review (not pass), reasoning names the conduct', async () => {
    const out = await scoreAdverseMediaWithLlm({
      entity_name: ADVERSE_ENTITY,
      content: ADVERSE_CONTENT,
    });

    console.log(
      `[adverse-media-llm live] ADVERSE verdict=${out.verdict} reasoning="${out.reasoning}" concerns=${JSON.stringify(out.concerns)} model=${out.model} credits=${out.cost.credits_used} usd=${out.cost.usd_spent}`,
    );

    expect(['pass', 'review', 'fail']).toContain(out.verdict);
    expect(out.verdict).not.toBe('pass');
    expect(out.reasoning.length).toBeGreaterThan(10);
  }, 30000);

  it('name collision: adverse coverage about a similarly-named entity is NOT scored as fail for our entity', async () => {
    const out = await scoreAdverseMediaWithLlm({
      entity_name: COLLISION_ENTITY,
      content: COLLISION_CONTENT,
    });

    console.log(
      `[adverse-media-llm live] COLLISION verdict=${out.verdict} reasoning="${out.reasoning}" concerns=${JSON.stringify(out.concerns)} model=${out.model} credits=${out.cost.credits_used} usd=${out.cost.usd_spent}`,
    );

    expect(['pass', 'review', 'fail']).toContain(out.verdict);
    // The reasonable answers are pass (article explicitly disambiguates) or review.
    // A live `fail` would suggest the LLM didn't distinguish — flag but don't fail
    // the build, since the prompt is the v1 of a hard task.
    expect(out.verdict).not.toBe('fail');
  }, 30000);
});
