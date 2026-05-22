# Internal Audit Record Specification v0.1

Normative specification for the signed, content-addressed JSON envelope
that AgentMarshal agents issue for **non-customer-touching actions**
evaluated against a Scope Contract. Pairs with
`internal-audit-record.schema.json` (Draft 2020-12), which is the formal
source of truth; this document is the human gloss.

## 1. Purpose and scope

A Compliance Receipt proves that an autonomous agent's
**customer-touching** action (email send, voice call, opt-out
propagation) was governed by an AgentMarshal Scope Contract. An Internal
Audit Record proves the same for the agent's **internal** actions —
template promotions, inbox retirements, pipeline-buffer adjustments,
classifier retraining, regulatory-state updates, scrape-rate
adjustments, and the rest of the operational surface that does not
reach a customer.

The two envelopes share the same crypto substrate (KeyRegistry, JCS
canonicalization per RFC 8785, Ed25519 signatures, RFC 7638 JWK
thumbprint key_ids). They differ in three places:

1. **Top-level discriminator.** Audit records carry
   `record_type: "internal_audit"`. Compliance Receipts produced under
   v0.1 carry no `record_type` field (implicit `compliance_receipt`);
   verifiers seeing no `record_type` MUST dispatch to the receipt
   verifier.
2. **Identifier prefix.** Audit record IDs are
   `ia-<uuidv4>`; Compliance Receipt IDs are bare UUIDv4. The prefix
   makes log inspection unambiguous.
3. **Body shape.** Audit records replace the receipt's customer-facing
   subject/resource/action fields with internal-action fields:
   `agent` (id/type/version), `action` (type/inputs/outputs),
   `contract` (id/version), `evaluation` (predicate/composite/decision).

Receipts and audit records form **parallel hash chains per agent**.
An agent emitting both has two independent sequences:
`previous_receipt_hash` for the receipt chain and `previous_audit_hash`
for the audit chain. This keeps each chain's monotonicity local and
auditable without interleaving.

## 2. Field reference

Top-level fields, grouped by role:

**Identification.**
- `internal_audit_version` — artifact-version constant `"0.1"`.
- `schema_version` — JSON Schema version constant `"0.1"`.
- `record_type` — discriminator constant `"internal_audit"`.
- `record_id` — `ia-` prefix followed by a UUIDv4.
- `audit_hash` — SHA-256 hex of the canonical form sans this field;
  provides content addressing.
- `previous_audit_hash` — prior audit record's `audit_hash` in this
  agent's chain, or `null`.
- `canonical_form` — canonicalization algorithm declaration; v0.1 is
  `"rfc8785"`.

**Provenance.**
- `issued_at` — ISO 8601 UTC timestamp of record construction.
- `code_version` — identifier of the AgentMarshal codebase that produced
  the record.
- `tenant_id` — operator tenant namespace.
- `evaluation_id` — joins the record to the underlying AuthZEN-shaped
  audit row.
- `request_id` — correlation identifier; for internal actions without a
  PEP-originated request, producers synthesize a stable internal ID.

**Action subject.**
- `agent` — object with `id` (per-instance), `type` (enum-restricted to
  the canonical 10-agent inventory from `agents.md` §1), `version`.
- `action` — object with `type` (free string in v0.2; enum registry
  comes with a later schema version), `inputs` (open object), `outputs`
  (open object).
- `contract` — object with `id` and `version` of the Scope Contract
  active at evaluation.

**Evaluation.**
- `evaluation.predicate_evaluations` — ordered per-rule predicate trace,
  identical shape to the receipt schema's `PredicateEvaluation`.
- `evaluation.composite_evaluations` — ordered composite predicate
  trace, identical shape to the receipt schema's
  `CompositePredicateEvaluation`. The fail-safe policy
  (`isAllowable()`) still applies: any `fail` or `stub` blocks `allow`.
- `evaluation.decision` — `{ effect, evaluation_path, matched_rule_id,
  reason_code, reason }`, identical shape to the receipt's `decision`.

**External anchor.**
- `regulatory_state` — same anchor block as Compliance Receipts. In
  v0.1 this is `{ pending: true, anchor_method: 'pending' }` by
  default; the Bright Data integration day populates real
  `rfc3161` / `opentimestamps` anchors.

**Signatures.**
- `signatures` — array of one or more `AuditRecordSignature` entries.
  Same shape as the receipt's `ReceiptSignature` (`algorithm`,
  `key_id`, `public_key_fingerprint`, `signature`, `signed_at`,
  `signer_role`). v0.1 supports `algorithm: "ed25519"` only.

## 3. Hash and signing protocol

The hash and signing protocol is **identical to Compliance Receipts**
modulo field-name substitution. The flow, restated here for clarity:

1. **Canonicalize** the body (record sans `audit_hash` and `signatures`)
   per RFC 8785 (JCS).
2. **Sign** the canonical bytes with each signer's `SigningHandle`;
   append the algorithm-tagged result to `signatures`.
3. **Recanonicalize** the body union the populated `signatures` array.
4. **Hash** that canonical form with SHA-256; store the hex digest in
   `audit_hash`.

See `compliance-receipt.md` §3–§5 for the underlying rationale
(multi-sig safety, why `audit_hash` necessarily excludes itself, why
canonicalization is in-band). The substrate is byte-shared with
Compliance Receipts:

- `lib/compliance/receipt/canonical.ts` — RFC 8785 wrapper.
- `lib/compliance/receipt/hash.ts` — SHA-256 helpers.
- `lib/compliance/receipt/sign.ts` — Ed25519 signing via `SigningHandle`.
- `lib/compliance/receipt/verify.ts` — generic Ed25519 verification over
  arbitrary canonical bytes.
- `lib/compliance/keys/*` — `KeyProvider`, `KeyRegistry`,
  `FileKeyProvider`, KMS provider stubs.

No new crypto code is introduced by this envelope.

## 4. Chain semantics

**Per-agent, per-record-type, parallel.** An agent's audit records form
a hash chain via `previous_audit_hash` (the first record's value is
`null`; each subsequent record references the prior record's
`audit_hash`). The chain is independent of the agent's Compliance
Receipt chain — they advance separately.

**Why parallel rather than interleaved.** A single interleaved chain
would force every audit record to chain to whichever record type came
last for that agent, mixing customer-touching and internal records in
one sequence. Parallel chains keep each sequence reasoned about in
isolation; cross-chain auditing joins on `agent.id` + `issued_at` when
a unified view is needed.

**Cross-tenant.** Chains do not cross tenants. Each tenant's agents
maintain their own per-record-type chains.

**Chain start.** The first audit record for an agent has
`previous_audit_hash: null`. The first record is therefore not
chain-anchored; producers seeking external anchoring for chain genesis
SHOULD populate `regulatory_state` with an `rfc3161` or
`opentimestamps` anchor at first-record time.

## 5. Agent-action examples

Concrete shapes for the kinds of actions that produce audit records.
`action.type` strings are illustrative; the v0.2 schema does not
constrain them (an enum registry replaces the free string in a later
version).

### 5.1 Template promotion (CampaignManager, Loop 1)

Weekly reply-rate optimization promotes a winning A/B variant.

- `agent.type`: `CampaignManager`
- `action.type`: `template_promoted`
- `action.inputs`: `{ cohort_id, candidate_template_ids, baseline_template_id, lookback_window_days }`
- `action.outputs`: `{ promoted_template_id, promotion_delta_pct, retired_template_ids }`

### 5.2 Inbox retirement (COO + InboxProvisioner, Loop 4)

Daily inbox health report retires a sender whose reputation dropped
below the operational threshold.

- `agent.type`: `InboxProvisioner`
- `action.type`: `inbox_retired`
- `action.inputs`: `{ sender_id, reputation_score, threshold, retirement_reason }`
- `action.outputs`: `{ retired_at, replacement_sender_id }`

### 5.3 Pipeline buffer adjustment (COO, Loop 6)

End-of-day pull controller adjusts tomorrow's pull plan after the
fallthrough multiplier changes.

- `agent.type`: `COO`
- `action.type`: `pipeline_buffer_adjusted`
- `action.inputs`: `{ current_buffer_count, send_rate_target, fallthrough_rate_rolling_7d, prior_pull_plan }`
- `action.outputs`: `{ new_pull_plan, projected_buffer_eod }`

### 5.4 Classifier retraining (ResponseHandler, Loop 3)

A human-correction event upgrades the reply-classifier rules.

- `agent.type`: `ResponseHandler`
- `action.type`: `classifier_retrained`
- `action.inputs`: `{ correction_event_id, original_classification, human_classification, message_features }`
- `action.outputs`: `{ updated_classifier_version, training_examples_added }`

### 5.5 Regulatory state update (RegulatoryMonitor, Loop 5)

Weekly compliance scrape produces a new regulatory_state hash and
emits drift advisories.

- `agent.type`: `RegulatoryMonitor`
- `action.type`: `regulatory_state_updated`
- `action.inputs`: `{ sources_scraped, prior_state_hash, scrape_window }`
- `action.outputs`: `{ new_state_hash, drift_advisories, anchor_method }`

### 5.6 Scrape rate adjustment (COO, Loop 6)

BD spend pacing tightens the daily scrape rate when MTD spend
approaches the monthly cap.

- `agent.type`: `COO`
- `action.type`: `scrape_rate_adjusted`
- `action.inputs`: `{ mtd_spend_usd, monthly_cap_usd, days_remaining, prior_rate }`
- `action.outputs`: `{ new_rate, projected_mtd_at_eom }`

## 6. Forward compatibility

**Discriminator dispatch.** The verifier model is: read `record_type`
first; if present, dispatch to the type-specific verifier; if absent,
treat as `compliance_receipt`. This keeps v0.1 receipts forward-readable
without retroactive schema changes and lets future record types
(`vendor_attestation`, `agent_payment`, etc.) be added cleanly.

**Forward additions permitted; removals not.** Same rules as Compliance
Receipts (`compliance-receipt.md` §9): v0.2 MAY add new top-level fields
(v0.1 verifiers reject via `additionalProperties: false`; consumers
needing forward compatibility upgrade their verifier). v0.2 MUST NOT
remove fields v0.1 marked required, MUST NOT narrow enum values to a
subset, MUST NOT change the semantics of an existing field.

**Action-type registry.** `action.type` is a free string in v0.2 to let
agents land before the action vocabulary is locked. A later schema
version will replace the free string with an enum registry; producers
SHOULD adopt stable action.type strings that map cleanly onto registry
entries when the enum lands.

**Cross-impl verification.** The Python cross-implementation verifier
(landed for Compliance Receipts in Bubble 3c) does not yet handle
`record_type: "internal_audit"`. Extension lives in a polish bubble
after the next planned wave of agent integration work; until then,
audit records are verifiable in TypeScript only.

## 7. References

- **`compliance-receipt.md`** — pairs with this document; the receipt
  envelope and signing/chaining substrate this envelope reuses.
- **`agents.md`** — agent inventory (§1), layered contracts (§2), and
  the receipts-vs.-audit-record allocation rule (§1, end-of-table note
  + §7.5).
- **RFC 8785** — JSON Canonicalization Scheme. Defines the canonical
  form declared by `canonical_form: "rfc8785"`.
- **RFC 7638** — JSON Web Key (JWK) Thumbprint. Defines the `key_id`
  identifier (with `am-` prefix in AgentMarshal signatures).
