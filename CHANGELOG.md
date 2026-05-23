# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Scope Contract artifact format (`spec/v0.1/scope-contract.schema.json`)
- Audit record companion schema (`spec/v0.1/audit-record.schema.json`)
- Composite predicate dispatch substrate (`lib/authzen/composite-dispatch.ts`): registry, Ajv-validated input schemas, fail-safe `isAllowable()` policy that treats `result: 'stub'` as non-allow
- `EvalContext` type (`lib/authzen/eval-context.ts`) carrying `tenant_id`, `agent_id`, `request_id`, and an `AuditEmitter` hook to composite predicates
- `composite_evaluations` field on `EvaluationResult` and `composite_checks` field on `ScopeRule` for declaring composite predicate invocations in Scope Contracts
- TCPA composite predicate library under `lib/compliance/predicates/tcpa/`: 6 predicates (2 stubs — `tcpa_dnc_registry_clear`, `tcpa_revocation_honored` — deferred to Bright Data integration day, 4 real checks) covering 47 CFR §64.1200(b)–(c) requirements; federal quiet-hours default with state-table integration point for the launch states
- CAN-SPAM composite predicate library under `lib/compliance/predicates/canspam/`: 6 predicates (1 stub `canspam_unsubscribe_mechanism_working` deferred to Bright Data integration day, 5 real checks) covering 15 USC §7704(a)(1)–(5)
- Explicit `registerAllTcpaComposites()` and `registerAllCanspamComposites()` registration functions for tree-shake resistance and grep-ability, with module-load side-effect calls preserving bare-import behavior
- Symmetric registry smoke tests under `tests/predicates/{tcpa,canspam}/`
- `docs(spec): agent inventory and layered contract model` (`spec/v0.1/agents.md`)
- `docs(spec): new predicate inventory (20 predicates queued for implementation)`
- `docs(spec): buffer-driven pull controller and daily cost report template`
- `docs(spec): six-loop self-improvement framework`
- `docs(spec): BD integration model with tiered enrichment depth`
- `feat(compliance): sourcing predicate stubs (8 predicates - 5 BD provenance, 3 sourcing) under lib/compliance/predicates/sourcing/`
- `feat(compliance): operational predicate stubs (7 predicates - 3 operational, 4 pipeline control) under lib/compliance/predicates/operational/`
- `feat(compliance): voice predicate stubs (4 predicates - runtime checks complementary to TCPA declarative checks) under lib/compliance/predicates/voice/`
- `feat(compliance): internal audit envelope (record_type: 'internal_audit') - schema + builder + spec doc, addresses agents.md §7.5 forward-reference`
- `feat(compliance): SMS deferred stub (sms_express_written_consent_recorded) under lib/compliance/predicates/sms/ — completes the 20-predicate v0.2 stub set (32 composites total registered)`
- `docs(spec): refresh spec/v0.1/README.md to include all current spec artifacts (scope-contract, audit-record, compliance-receipt + md, internal-audit-record + md, agents.md) with explicit audit-record vs internal-audit-record distinction`
- `docs(spec): tier-metadata call-site contract note in agents.md §5.5 — clarifies that Tier 1/2/3 enrichment depth is surfaced by LeadScraper/Personalizer callers, not by individual composite predicates`

### Changed
- TCPA composite predicate names normalized to predicate-attribute convention to match CAN-SPAM and produce naturally-readable receipt entries (`tcpa_quiet_hours_check` → `tcpa_quiet_hours_respected`, etc.; full map in this commit). Behavior unchanged.
- `lib/compliance/predicates/tcpa/index.ts` refactored to export `registerAllTcpaComposites()` alongside the existing side-effect import. Bare-import behavior unchanged.
- `chore(spec): replace "Day 6" relative references with "Bright Data integration day" semantic anchor across predicate stub comments (tcpa, canspam), agents.md (§2.1, §2.2, §7.2), and compliance-receipt schema + spec doc`
- `refactor(tests): sourcing predicate tests refactored from 1-block to 3-block pattern for parity with operational/voice/sms convention - codebase test-shape consistency, no behavior change`

### Deprecated
- v0.1 manifest format — will be superseded once Scope Contracts replace it end-to-end.
