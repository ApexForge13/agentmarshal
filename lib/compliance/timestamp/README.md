# RFC 3161 timestamp anchoring

Every Compliance Receipt and Internal Audit envelope can carry a third-party
**timestamp token (TST)** proving *when* the receipt's integrity hash existed —
independent of AgentMarshal's clock or records. This is the structural answer to
the failure mode in *OFAC v. TradeStation Securities* (Mar 2026, $1.1M): when a
regulator examines a system years later, "trust our logs about when this
happened" is replaced by "here is a TSA-signed time anchor for this exact hash."

## What gets timestamped

The TSA stamps the receipt's **`receipt_hash`** (or **`audit_hash`** for Internal
Audit records) — the chain-pointer hash that is already the receipt's integrity
anchor. `receipt_hash` is itself a SHA-256 digest, so it goes straight into the
RFC 3161 `messageImprint` (hashAlgorithm = SHA-256); there is no double-hashing.
Stamping the hash, not the body, keeps the token small and means the token proves
"this exact receipt existed at time T."

The token is stored as base64 DER in a top-level `timestamp_token` field. It is
**not** part of the signed body — it is attached *after* signing (the same way the
`signatures` array and `receipt_hash` are excluded from the signed bytes) and is
stripped before canonicalization on verify. Older receipts (pre-timestamping) and
receipts issued while the TSA was unreachable simply have `timestamp_token: null`
and verify cleanly as `timestamped: false`.

## Why FreeTSA

[FreeTSA.org](https://freetsa.org) is a free, public, RFC 3161 TSA with a stable
published Root CA (valid 2016–2041). For the v0.2 hackathon it is the single TSA.
Its signing certificate uses **RSA with SHA-512**, which is why the verifier is
algorithm-agile rather than assuming SHA-256.

The FreeTSA Root CA is **pinned** in [`freetsa-ca.ts`](./freetsa-ca.ts) (with a
SHA-256 fingerprint assertion) and committed in PEM form under
[`certs/`](./certs/) for audit. The verifier trusts **only** this pinned root —
the root certificate that FreeTSA also embeds inside each token is ignored, so a
forged self-signed root cannot widen trust.

## Degradation policy

Timestamping is best-effort and never blocks emission:

- The TSA call has a **2-second timeout**.
- On timeout, non-200, TSA refusal, or a malformed response, the client logs a
  warning and returns `null`. The receipt is still signed — just not externally
  timestamped (`timestamp_token: null`).
- Production should track TSA availability rate from these warnings (no metrics
  work in v0.2).

## Redundancy roadmap (post-funding)

A single TSA is a single point of failure and a single point of trust. After
funding:

1. **Multiple TSAs** — submit each receipt hash to ≥2 independent TSAs (e.g.
   FreeTSA + a commercial TSA + DigiCert) and store an array of tokens; a receipt
   is "timestamped" if any one verifies, "strongly timestamped" if a quorum does.
2. **OpenTimestamps / blockchain anchoring** — aggregate many receipt hashes into
   a Merkle root anchored to Bitcoin for trust that survives any single TSA going
   dark. (`regulatory_state.anchor_method` already reserves `opentimestamps`.)
3. **Long-term validation (LTV)** — embed the full cert chain + OCSP/CRL responses
   in the token so it remains verifiable after the TSA cert expires.

## Swapping or adding a TSA

1. Add the new TSA's Root CA (PEM + pinned SHA-256 fingerprint) alongside
   `FREETSA_ROOT_PEM` in `freetsa-ca.ts`, and commit the PEM under `certs/`.
2. Point `createFreeTsaTimestamper({ url })` at the new endpoint (or add a sibling
   factory) — the request/parse code is TSA-agnostic RFC 3161.
3. Make `verify-timestamp.ts` try each pinned root and accept the first chain that
   validates. The digest map already covers SHA-1/256/384/512.

## Manual end-to-end check (not run in CI)

`scripts/check-freetsa.mts` hits the **real** FreeTSA, submits a live timestamp
request, and verifies the round-trip offline against the pinned root:

```
pnpm tsx scripts/check-freetsa.mts
```

CI **never** touches the network: all automated tests
(`tests/timestamp/*`) use captured FreeTSA tokens as fixtures, and the
deterministic `/verify` example generator injects a stand-in timestamper that
replays those captured tokens, so committed bytes stay stable across runs.
Re-capture fixtures with `CAPTURE_TSA_FIXTURES=1` (see
`tests/timestamp/fixtures/`).
