# Submission checklist (lablab.ai)

Inventory of the submission-form fields, the asset for each, and its status.
Status values are documentation only; the operator confirms or fills them on
recording day. Status legend: READY (asset exists and is verified), VERIFY
(asset exists but confirm it is the current version), PENDING (not produced yet).

## Form fields

| Field | Asset | Status |
| --- | --- | --- |
| Project name | AgentMarshal | READY |
| Tagline / short description | Verdict gives you a verdict. AgentMarshal gives you the receipt that proves it. | READY |
| Full description | Governance and audit-evidence layer for autonomous AI agents, built on Veea's Lobster Trap and wired to Bright Data. Scope Contracts govern each action; every decision emits an Ed25519-signed, FreeTSA-timestamped Compliance Receipt that anyone can verify at /verify. See README.md. | READY |
| Live demo / app URL | https://demo.agentmarshal.dev | READY (verified live) |
| Verify tool URL | https://demo.agentmarshal.dev/verify and /receipts | READY (verified live) |
| Presentation video (YouTube) | https://youtu.be/r06KiTgo7-Q | VERIFY (confirm this is the current v0.2 recording, not the prior cut) |
| Source repository | https://github.com/ApexForge13/agentmarshal | VERIFY (confirm pushed to the public repo and at the demo commit) |
| Cover image / thumbnail | - | PENDING |
| Pitch deck / slides | - | PENDING |
| Technologies used (tags) | Next.js 16, TypeScript, pnpm, better-sqlite3, Ed25519, RFC 8785 (JCS), RFC 3161 (FreeTSA), Veea Lobster Trap, AI/ML API (gpt-4.1-mini), Bright Data, Fly.io | READY |
| Team members | - | PENDING (operator fills) |

## Partner prizes targeted

| Track / prize | Evidence in the build | Status |
| --- | --- | --- |
| Best Use of AI/ML API | entity_adverse_media_check scores adverse media with the AI/ML API (openai/gpt-4.1-mini); the model verdict and reasoning ride inside the signed receipt body | READY |
| Bright Data | Six governed Bright Data products behind the MCP proxy at /api/mcp/v1 (SERP, Web Unlocker, Crawl API, MCP Server passthrough, Scraping Browser, proxy network), each gated by Scope Contract bd_permissions | READY |

## Pre-submission gates

- [ ] Demo URL serves the cold open (see docs/demo/recording-day-checklist.md)
- [ ] Video uploaded and link confirmed current
- [ ] Repo pushed public at the demo commit; README renders correctly on GitHub
- [ ] Cover image produced and uploaded
- [ ] Team members listed
- [ ] Partner-prize boxes checked on the form (AI/ML API, Bright Data)
