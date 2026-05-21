# AgentMarshal Tools

Cross-implementation utilities. These exist outside the main TS codebase so
auditors, regulators, and customers can verify AgentMarshal artifacts using
language- and vendor-neutral tools.

## `verify-receipt.py` — Compliance Receipt verifier

Independent reference implementation of Compliance Receipt v0.1 verification,
written in Python. Depends only on the standard library plus two well-audited
PyPI packages (no AgentMarshal Python module).

### Prereqs

```bash
pip install cryptography>=42.0 jcs>=0.2.1
```

### Usage

Verify against a JWK Set:

```bash
python3 tools/verify-receipt.py <receipt.json> --jwks <jwks.json>
```

Verify against a single PEM-encoded Ed25519 public key:

```bash
python3 tools/verify-receipt.py <receipt.json> --pubkey-pem <public.pem>
```

### What it checks

1. `receipt_hash` integrity — canonicalizes the receipt minus the hash field
   and SHA-256-hashes it; compares to the stored `receipt_hash`.
2. Each entry in `signatures` — looks up the public key (by `key_id` for
   JWKS mode; the only key in PEM mode), reconstructs the signed payload
   (receipt minus `receipt_hash` and `signatures`), canonicalizes it per
   RFC 8785, and runs Ed25519 verification.

If both pass, prints `OK` and exits 0.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | All signatures verify; `receipt_hash` matches. |
| 1 | Verification failed (signature, hash, or schema-shape). Details on stderr. |
| 2 | Argument or file error (missing file, unparseable JSON, wrong key type). |

### Examples

Against the committed golden fixtures:

```bash
python3 tools/verify-receipt.py \
  tests/vectors/golden-receipt.json \
  --jwks tests/vectors/golden-jwks.json
```

Same fixture, PEM input:

```bash
python3 tools/verify-receipt.py \
  tests/vectors/golden-receipt.json \
  --pubkey-pem tests/vectors/keys/golden-public-key.pem
```
