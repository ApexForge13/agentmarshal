# Scope Contract Specification v0.1

Normative specification for the persistent operator-scoped policy artifact
that Marshal v0.2 evaluates against AuthZEN-shaped requests, plus the
companion record formats every evaluation and agent action must produce.

## Files

### Policy artifact

- `scope-contract.schema.json` — JSON Schema Draft 2020-12, normative.
  The persistent, operator-scoped policy artifact. Marshal evaluates
  AuthZEN-shaped requests against it.

### Evaluation log (AuthZEN audit trail)

- `audit-record.schema.json` — JSON Schema Draft 2020-12, normative
  companion. **AuthZEN audit log.** Plain (unsigned) record produced for
  every Scope Contract evaluation: request, response, evaluation path,
  per-predicate trace, plus reserved fields for v0.2 cryptographic
  signing. One audit record per evaluation, regardless of outcome.

### Signed action envelopes

These two artifacts share signing/chaining crypto and are discriminated
by `record_type`. They are NOT the AuthZEN audit log — they are the
content-addressed proofs that an agent acted under a governed contract.

- `compliance-receipt.schema.json` + `compliance-receipt.md` — JSON
  Schema + human gloss. Signed, content-addressed, RFC 8785-canonicalized
  envelope for **customer-touching** agent actions (email send, voice
  call, opt-out propagation). Offline-verifiable, algorithm-agile,
  multi-signature ready, hash-chained per agent.

- `internal-audit-record.schema.json` + `internal-audit-record.md` —
  JSON Schema + human gloss. Signed, content-addressed,
  RFC 8785-canonicalized envelope for **non-customer-touching** agent
  actions (template promotions, inbox retirements, pipeline-buffer
  adjustments, daily reports, internal corrections). Issued by agents
  whose direct actions do not produce Compliance Receipts (LeadScraper,
  Validator, InboxAllocator, Personalizer, COO, InboxProvisioner,
  RegulatoryMonitor) and by customer-touching agents for their internal
  operations.

### Product architecture

- `agents.md` — Normative product-architecture specification for the
  ten-agent AgentMarshal v0.2 deployment that runs against the v0.1
  contract and receipt artifacts. Source of truth for agent inventory,
  layered contracts (`outreach_v1`, `email_v1`, `voice_v1`,
  `sourcing_v1`, `response_v1`, `operational_v1`), Bright Data
  integration model, and queued composite predicates.

## Distinguishing `audit-record` from `internal-audit-record`

These two artifact families are easy to conflate by name. They are not
the same thing:

- `audit-record.schema.json` is the **AuthZEN evaluation log**. Marshal
  produces one for every Scope Contract evaluation. It is a log entry,
  not a signed envelope.
- `internal-audit-record.schema.json` is a **signed action envelope**
  for non-customer-touching agent actions. It shares the cryptographic
  substrate (signing, content-addressing, hash chaining) with
  `compliance-receipt.schema.json` and is discriminated by `record_type`.

A single agent action typically produces both: an `audit-record`
documenting the evaluation, plus either a `compliance-receipt` (if
customer-touching) or an `internal-audit-record` (if not).

## License

MIT. Inherits from repository root LICENSE.

## Status

v0.1 locked. v0.2 work in progress.
