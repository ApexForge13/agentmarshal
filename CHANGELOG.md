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
- TCPA composite predicate library under `lib/compliance/predicates/tcpa/`: 6 predicates (2 stubs — `tcpa_dnc_registry_clear`, `tcpa_revocation_honored` — deferred to Day 6, 4 real checks) covering 47 CFR §64.1200(b)–(c) requirements; federal quiet-hours default with state-table integration point for the launch states
- CAN-SPAM composite predicate library under `lib/compliance/predicates/canspam/`: 6 predicates (1 stub `canspam_unsubscribe_mechanism_working` deferred to Day 6, 5 real checks) covering 15 USC §7704(a)(1)–(5)
- Explicit `registerAllTcpaComposites()` and `registerAllCanspamComposites()` registration functions for tree-shake resistance and grep-ability, with module-load side-effect calls preserving bare-import behavior
- Symmetric registry smoke tests under `tests/predicates/{tcpa,canspam}/`

### Changed
- TCPA composite predicate names normalized to predicate-attribute convention to match CAN-SPAM and produce naturally-readable receipt entries (`tcpa_quiet_hours_check` → `tcpa_quiet_hours_respected`, etc.; full map in this commit). Behavior unchanged.
- `lib/compliance/predicates/tcpa/index.ts` refactored to export `registerAllTcpaComposites()` alongside the existing side-effect import. Bare-import behavior unchanged.

### Deprecated
- v0.1 manifest format — will be superseded once Scope Contracts replace it end-to-end.
