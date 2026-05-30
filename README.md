# AgentMarshal

> AgentMarshal gives you the receipt that proves what your agent knew when it decided.

AgentMarshal is a governance and audit-evidence layer for autonomous AI agents
that produces a cryptographically signed, externally timestamped, independently
verifiable receipt for every decision and every refusal. Every agent action,
including every Bright Data call (SERP, Crawl API, Web Unlocker, and Scraping
Browser, all through an MCP proxy), is checked against a declarative Scope
Contract before it runs and sealed into that receipt, which anyone can verify
without trusting AgentMarshal at all.

- Demo video: https://youtu.be/ZOu_-YMRmEE
- Live demo: https://demo.agentmarshal.dev/receipts
- Verify a receipt: https://demo.agentmarshal.dev/verify
- Receipt browser (demo cold open): https://demo.agentmarshal.dev/receipts
- Repo: https://github.com/ApexForge13/agentmarshal

## What this is

Authorization engines answer one question: allow or deny. That answer is a
verdict, and a verdict is only as trustworthy as the system that produced it.
When a regulator examines an AI system years after the fact, "our logs say we
checked" is not evidence. AgentMarshal turns every agent decision into evidence:
a Compliance Receipt carrying the declared scope, the detected intent, the rules
that fired, the verdict, and the inputs that drove it, signed with Ed25519 over
the RFC 8785 (JCS) canonical form of the record and anchored to a third-party
RFC 3161 timestamp. Change a single character of a signed receipt and
verification fails. The signature and the timestamp are independently checkable,
so the proof does not depend on trusting AgentMarshal or its clock.

AgentMarshal sits above Lobster Trap (the inspection floor) and below any agent
framework. Lobster Trap inspects prompts and scores risk. AgentMarshal consumes
those signals, evaluates the action against the agent's Scope Contract, and
produces the receipt.

## Why it matters

AI agents are making decisions at machine speed. AgentMarshal produces signed,
timestamped, externally-anchored receipts for every decision and every refusal.

The demo screens counterparties for sanctions exposure and adverse media, then
shows the receipt browser at /receipts: a chain of signed Internal Audit records
(a clean counterparty, an adverse-media hit, a name-collision case, and a
governance denial). Each carries a real adverse-media verdict and a real FreeTSA
timestamp. The cold open opens a green VERIFIED receipt, edits one character of
the model's reasoning, and re-verifies it live: the verdict flips to red
TAMPERED with a signature mismatch.

## How governance works

- Scope Contracts. Versioned, AuthZEN-shaped policy artifacts attached to an
  agent: what actions are authorized, what is hard-denied, escalation routing,
  validity windows, and supersession chains so authority can be amended without
  losing audit history. Schemas live in spec/v0.1/.
- Composite predicates. Reusable checks invoked by contracts: sanctions
  screening, adverse-media scoring, TCPA and CAN-SPAM communication compliance,
  spend caps, cross-tenant isolation, injection-pattern checks, and Bright Data
  provenance.
- Receipts and audit records. Communication actions earn a Compliance Receipt;
  internal actions earn an Internal Audit record. Both are signed and
  timestamped; both are verifiable at /verify and via POST /api/verify/receipt.

## Bright Data integration

AgentMarshal governs Bright Data calls end to end. Agents reach Bright Data
through AgentMarshal's MCP proxy at /api/mcp/v1, which evaluates each tool call
against the agent's Scope Contract bd_permissions before forwarding approved
calls. Six Bright Data products are governed:

1. SERP API (serp_adverse_media_search)
2. Web Unlocker (unlock_news_article)
3. Crawl API (crawl_article_content)
4. MCP Server passthrough (bd_mcp_passthrough, a single allowlisted generic tool
   so any tool Bright Data adds is auto-governed)
5. Scraping Browser (browse_registry_page, via puppeteer-core over CDP)
6. The underlying proxy network that the above ride on

## AI/ML API integration

Adverse-media scoring is powered by the AI/ML API (OpenAI-compatible,
openai/gpt-4.1-mini). The entity_adverse_media_check predicate sends article
content to the model for a structured risk verdict plus reasoning, and falls
back to keyword scoring if the model call fails. The model verdict and its
reasoning ride inside the signed receipt body, so tampering with the reasoning
breaks signature verification.

## Architecture

```
Agent (OpenAI-compatible client, or MCP client)
    |
Lobster Trap reverse proxy            AgentMarshal MCP proxy (/api/mcp/v1)
  deep prompt inspection                governs Bright Data tool calls
  risk score, intent, injection         against Scope Contract bd_permissions
    |                                     |
AgentMarshal evaluation (AuthZEN /access/v1/evaluation)
  Scope Contract + composite predicates -> ALLOW / HUMAN_REVIEW / DENY
    |
Signed Compliance Receipt or Internal Audit record
  Ed25519 over RFC 8785 (JCS) canonical form + RFC 3161 (FreeTSA) timestamp
    |
SQLite audit log  ->  Next.js dashboard, /receipts browser, /verify tool
```

Architecture and contract model are specified in:

- spec/v0.1/agents.md (agent inventory, layered contracts, Bright Data model)
- spec/v0.1/scope-contract.schema.json, compliance-receipt.schema.json,
  internal-audit-record.schema.json, audit-record.schema.json
- AGENTS.md and CLAUDE.md (repo conventions)

## Tech stack

- Next.js 16 (App Router), TypeScript, pnpm
- Policy engine: custom TypeScript, YAML-driven, first-match-wins, with composite
  predicate dispatch validated by Ajv
- Cryptography: Ed25519 signatures, RFC 8785 JCS canonicalization, RFC 3161
  timestamps anchored at FreeTSA
- Inspection layer: Veea Lobster Trap (Go sidecar, unmodified)
- LLM backend: OpenAI-compatible (Groq in the hosted demo); AI/ML API for
  adverse-media scoring
- Data acquisition: Bright Data (six products, governed via MCP proxy)
- Storage: SQLite via better-sqlite3
- Hosting: Fly.io

## Run it locally

```bash
git clone https://github.com/coal/lobstertrap.git
git clone https://github.com/ApexForge13/agentmarshal.git

# Lobster Trap sidecar (separate terminal, kept running on :8080)
cd lobstertrap
./lobstertrap serve

# AgentMarshal
cd ../agentmarshal
pnpm install
cp .env.local.example .env.local   # then fill in the values
pnpm dev
```

Open http://localhost:3000. The /verify and /receipts pages work offline against
the bundled demo receipts; the live Bright Data and AI/ML paths need credentials.

Environment variable names (set values in .env.local, none are committed):

- Lobster Trap and LLM backend: LT_PROXY_URL, LT_BACKEND, LT_MODEL, LT_CHAT_PATH,
  LT_API_KEY
- AI/ML API (adverse-media scoring): AIML_API_KEY
- Bright Data: BRIGHTDATA_API_TOKEN, BRIGHTDATA_SERP_ZONE,
  BRIGHTDATA_UNLOCKER_ZONE, BRIGHTDATA_CRAWL_DATASET_ID, BRIGHTDATA_BROWSER_USER,
  BRIGHTDATA_BROWSER_PASS, BRIGHTDATA_BROWSER_ZONE
- Gemini client: GEMINI_API_KEY
- Voice agent (optional): VAPI_API_KEY, VAPI_PHONE_NUMBER_ID,
  VOICE_WEBHOOK_PUBLIC_URL, AGENTMARSHAL_AGENT_ID
- Timestamp control (optional): AGENTMARSHAL_TSA_OFFLINE, AGENTMARSHAL_CODE_VERSION

## Verify a receipt yourself

```bash
# Fetch AgentMarshal's published public key (JWK + hex)
curl https://demo.agentmarshal.dev/api/verify/public-key

# Verify a receipt body: returns verified true/false, the record fields,
# and an independent RFC 3161 timestamp verdict
curl -X POST https://demo.agentmarshal.dev/api/verify/receipt \
  -H 'Content-Type: application/json' \
  -d '{"receipt": { ...paste a signed receipt... }}'
```

Or paste any receipt JSON into https://demo.agentmarshal.dev/verify.

## Deploy

The production image is defined by Dockerfile, fly.toml, and entrypoint.sh, and
runs on Fly.io. The signing key and the persisted demo receipts live on a Fly
volume, not in the image. See docs/demo/recording-day-checklist.md for the
pre-recording verification sequence.

## License

MIT. See LICENSE.

## Acknowledgments

- Veea, for open-sourcing Lobster Trap and making prompt inspection a primitive
- Bright Data, for the data-acquisition products governed in the demo
- AI/ML API, for the adverse-media scoring model
- FreeTSA, for the public RFC 3161 timestamp authority
