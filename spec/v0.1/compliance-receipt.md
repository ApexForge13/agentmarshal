# Compliance Receipt Specification v0.1

Normative specification for the signed, content-addressed JSON artifact that
AgentMarshal issues for every Scope Contract evaluation. Pairs with
`compliance-receipt.schema.json` (Draft 2020-12), which is the formal source
of truth; this document is the human gloss.

## 1. Overview

A Compliance Receipt is a JSON object that proves an autonomous agent action
was governed by an AgentMarshal Scope Contract at the moment of authorization.
It captures the decision (`allow`, `deny`, or `escalate`), the evaluation
trace that produced it, the contract and code version under which evaluation
ran, and one or more cryptographic signatures binding the entire record to
the issuing party.

Receipts are issued by AgentMarshal's authorization endpoint. They are
verified by anyone with the issuer's public keys: regulators reviewing an
incident, vendors confirming that an inbound action was pre-authorized,
operators reconciling agent behavior against their declared scope, and end
customers requesting a "show me the receipt" disclosure. Verification is
intentionally offline-capable; everything needed to verify a receipt is in
the receipt or in the issuer's published JWKS, with no callback to a live
service.

Receipts are content-addressed via `receipt_hash` (SHA-256 hex of the
canonical form of the receipt sans the hash field itself) and optionally
hash-chained per agent via `previous_receipt_hash`. The combination provides
both per-record integrity and per-agent sequence tamper-evidence.

## 2. When a Receipt Is Issued

Every Scope Contract evaluation produces a receipt — `allow`, `deny`, and
`escalate` decisions all yield one. This is deliberate: a verifiable audit
trail of refused or escalated actions is at least as valuable as a trail of
allowed ones. An operator answering "did your agent ever try to call this
recipient on the DNC list" benefits from receipts proving every denial, not
just every send.

Receipts are constructed after the evaluation completes, with the
`evaluation_id` field joining the receipt back to the corresponding audit
row (which holds the full AuthZEN-shaped request and response). They are
signed before being returned to the caller; consumers receive a fully-formed
record, never an unsigned draft.

Issuance is idempotent in principle but the spec does not mandate
deduplication. A re-issued receipt for the same evaluation MUST share its
`evaluation_id` and SHOULD have a fresh `receipt_id`. Verifiers MAY treat
multiple receipts with the same `evaluation_id` as equivalent provenance.

## 3. Field Reference

Top-level fields, grouped by role:

**Identification.**
- `receipt_version` — artifact-version constant `"0.1"`.
- `schema_version` — JSON Schema version constant `"0.1"`.
- `receipt_id` — UUIDv4 unique to this receipt.
- `receipt_hash` — SHA-256 hex of the canonical form sans this field; provides content addressing.
- `previous_receipt_hash` — prior receipt's hash for per-agent chaining, or `null`.
- `canonical_form` — canonicalization algorithm declaration; v0.1 is `"rfc8785"`.

**Provenance.**
- `issued_at` — ISO 8601 UTC timestamp of receipt construction.
- `code_version` — identifier of the AgentMarshal codebase that produced the receipt (typically a git SHA-1).
- `contract_id`, `contract_version` — Scope Contract identity active at evaluation.
- `tenant_id`, `agent_id`, `evaluation_id`, `request_id` — operational identifiers tying the receipt to the broader trace.

**Decision.** A nested object with `effect` (`allow` / `deny` / `escalate`),
`evaluation_path` (`temporal`, `out_of_scope`, `declared_scope`, `no_match`),
`matched_rule_id` (non-null only on `declared_scope`), `reason_code`, and
`reason`.

**Trace.** `predicate_evaluations` is the ordered per-rule predicate
trace from the AuthZEN evaluator. `composite_evaluations` is the ordered
trace of composite predicate results (TCPA, CAN-SPAM, etc.). Each composite
entry includes its predicate name, result (`pass` / `fail` / `stub`),
human-readable reason, and an open `details` bag for predicate-specific
context.

**External anchors.** `regulatory_state` carries an anchor binding the
receipt to a point-in-time snapshot of external regulatory data. In v0.1
this is `{ pending: true, anchor_method: 'pending' }` by default; Day 6
Bright Data integration populates real anchors with `rfc3161` or
`opentimestamps` methods.

**Signatures.** An array of one or more signature entries, each containing
`algorithm`, `key_id`, `public_key_fingerprint`, `signature` (hex),
`signed_at`, and `signer_role`. v0.1 supports `algorithm: "ed25519"` only.

## 4. Canonical Form

Receipts are canonicalized per RFC 8785 (JSON Canonicalization Scheme, JCS)
before signing and before hashing. JCS produces a byte-deterministic
representation of any JSON-serializable value by sorting object keys
lexicographically and applying a fixed number-formatting rule.

The `canonical_form` field declares the algorithm in-band. This is the
mechanism by which future canonicalization rotations leave older receipts
verifiable: a v0.2 receipt may carry `canonical_form: "rfc8785"` or some
later identifier, and a multi-version verifier dispatches on the field. The
v0.1 receipt format requires the value `"rfc8785"`.

JCS sorts keys at every nesting level, so the order in which fields appear
in this document, in the schema, or in producer-side code has no bearing on
the canonical byte sequence. Implementations MUST canonicalize before
hashing or signing; raw `JSON.stringify` output is not interchangeable.

## 5. Signing Payload

The signed payload is the receipt body **excluding** `receipt_hash` and
`signatures`. Concretely: the verifier constructs an object containing every
top-level field of the receipt except those two, canonicalizes it, and runs
signature verification against the resulting UTF-8 bytes.

Excluding `receipt_hash` from the signed payload is necessary because the
hash is computed over the canonical form, and a value cannot meaningfully
hash-cover itself. Excluding `signatures` from the signed payload is what
makes the receipt format multi-sig-capable: a second signer can append a
signature without invalidating the first signer's bytes.

The `receipt_hash` is computed **after** all signatures are appended: it is
SHA-256 hex of the canonical form of the receipt-minus-`receipt_hash`,
i.e., the body plus the populated `signatures` array. This means
`receipt_hash` covers the signatures themselves, providing a single
content-address that captures the entire signed record.

## 6. Verification Procedure

To verify a receipt, perform the following steps in order. Failing any step
constitutes a verification failure.

1. **Schema validate.** Run the receipt against
   `compliance-receipt.schema.json` for the declared `schema_version`. The
   schema is Draft 2020-12; `additionalProperties: false` at the top level
   means unknown fields are a failure.
2. **Receipt hash integrity.** Remove `receipt_hash` from the receipt;
   canonicalize the remainder per `canonical_form`; SHA-256 hex the result;
   compare to the removed `receipt_hash`. They MUST match.
3. **Per-signature verification.** For each entry in `signatures`:
   a. Look up the public key by `key_id` (RFC 7638 JWK thumbprint with
      `am-` prefix). Sources include a cached JWKS file, an issuer
      key-distribution endpoint, or an out-of-band published JWK.
   b. Reconstruct the signed payload: receipt minus `receipt_hash` and
      `signatures`. Canonicalize per `canonical_form`.
   c. Verify the `signature` (hex) over the canonical bytes using the
      resolved public key and the declared `algorithm`.
4. **Optional anchor verification.** If `regulatory_state.pending` is false
   and `anchor_method` is `rfc3161` or `opentimestamps`, MAY verify the
   anchor against the corresponding timestamping protocol. Anchor failure
   downgrades trust but does not invalidate the signatures.

Offline verification is supported: steps 1, 2, and 3 require only the
receipt itself plus a cached JWK Set for the issuer. No live network call
is needed to confirm that a receipt was issued by the expected key.

## 7. Threat Model

**Body tampering after issuance.** Any change to a body field invalidates
the signatures, since the signed payload is the canonical body bytes. The
verifier catches this in step 3 of the verification procedure.

**`receipt_hash` substitution.** Replacing `receipt_hash` with an attacker
value but leaving the body intact is caught by step 2 (the recomputed hash
will not match the stored one). Replacing both body and hash to match each
other is caught by step 3, because the signatures still cover the original
body.

**Replay.** A valid receipt re-presented later proves the original
evaluation occurred but does not prove the underlying action is still
authorized. Consumers concerned with replay MUST compare `issued_at` to a
local freshness policy, and SHOULD use `regulatory_state.anchor_timestamp`
when present to confirm the receipt was anchored before the relevant
external state changed.

**Key compromise.** A stolen private key can produce forged receipts that
verify against the corresponding public key. Mitigations: keys rotate via
the in-memory `KeyRegistry` (file-based PEMs for dev; KMS for production
post-funding), the `key_id` field allows old receipts to remain verifiable
under rotated keys, and the receipt format does not commit to any single
trust root — multiple `signer_role` values let consumers require co-signing
by parties whose threat surfaces differ.

**Out of scope.** This format does not address an attacker fabricating the
inputs to evaluation (e.g., spoofing the AuthZEN request). Defending the
pre-signing input pipeline is the responsibility of the PEP and transport
layer, not the receipt.

## 8. Multi-Signature Semantics

The receipt carries an array of signatures, not a single one. Multi-sig is
ready by construction; v0.1 producers typically populate one entry, with
`signer_role: "agentmarshal"`.

When multiple signatures are present, **all** MUST verify for the receipt
to be considered valid. The role field lets consumers reason about which
parties co-attested:

- `agentmarshal` — the AgentMarshal substrate that performed the
  evaluation. Always present.
- `operator` — the operator (the agent's principal). Co-signing by
  the operator binds them to the action's authorization at the
  policy-issuance layer.
- `vendor` — a downstream system that received the authorized action
  (e.g., a voice-call platform, a CRM, an email service). Vendor
  co-signing closes the loop: the vendor attests it received this
  specific receipt before executing the action.

Producers MAY add roles in future schema versions; v0.1 verifiers MUST
reject unknown `signer_role` values per the enum constraint.

## 9. Versioning and Backwards Compatibility

`receipt_version` and `schema_version` are independent fields. The split
exists because the artifact format and its JSON Schema may evolve at
different cadences: a clarifying schema change may apply to existing v0.1
receipts, while a true format change rotates the artifact version.

**v0.1 receipts MUST remain verifiable indefinitely.** This is a hard
commitment, not a soft target. A v0.2 verifier MUST be able to verify
receipts issued under v0.1; producers SHOULD be able to consume v0.1
receipts as well. The mechanism is multi-version dispatch on
`schema_version` (and, where relevant, `canonical_form`).

**Forward additions are permitted; removals are not.** v0.2 MAY add new
top-level fields (which v0.1 verifiers will reject due to
`additionalProperties: false`; consumers needing forward compatibility MUST
upgrade to a v0.2 verifier). v0.2 MUST NOT remove fields that v0.1 marked
required, MUST NOT narrow enum values to a subset, and MUST NOT change the
semantics of an existing field. New `signer_role` values, new `algorithm`
values, and new `anchor_method` values are forward additions and are
permitted.

## 10. References

- **RFC 8785** — JSON Canonicalization Scheme. Defines the canonical form
  declared by `canonical_form: "rfc8785"`.
- **RFC 7638** — JSON Web Key (JWK) Thumbprint. Defines the `key_id`
  identifier (with `am-` prefix in AgentMarshal receipts).
- **RFC 5280** — Internet X.509 Public Key Infrastructure Certificate and
  CRL Profile. Reserved for future receipt extensions that bind keys to
  X.509 chains.
- **RFC 3161** — Internet X.509 Public Key Infrastructure Time-Stamp
  Protocol. Identified by `anchor_method: "rfc3161"` in
  `regulatory_state`.
- **OpenTimestamps** — Bitcoin-anchored timestamping. Identified by
  `anchor_method: "opentimestamps"`.
- **FCC 24-17** — FCC's 2024 rulemaking on AI-generated and prerecorded
  voice calls, the regulatory context that motivates the TCPA composite
  predicates whose evaluations appear in `composite_evaluations`.
- **OpenID AuthZEN 1.0** — Authorization API the evaluation is shaped
  against; the receipt's `evaluation_id` and `request_id` join receipts to
  AuthZEN audit rows.
- **AP2 (Agent Payments Protocol)** — Reserved as a future receipt
  extension namespace for agent-to-agent payment authorization.
