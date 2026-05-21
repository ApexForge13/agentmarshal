# Test Vectors and Golden Fixtures

This directory holds the canonical test vectors and golden artifacts used by
the Compliance Receipt test suite and by `tools/verify-receipt.py`.

## Files

| File | Purpose |
|---|---|
| `jcs-test-vectors.json` | RFC 8785 canonicalization vectors. Consumed by `tests/compliance/receipt/jcs-vectors.test.ts`. |
| `golden-receipt.json` | Fully-signed Compliance Receipt with deterministic inputs. Consumed by `golden-receipt.test.ts` and `cross-impl.test.ts`. |
| `golden-jwks.json` | JWKS (RFC 7517 JWK Set) holding the public key that verifies `golden-receipt.json`. |
| `keys/golden-public-key.pem` | The same public key in SPKI PEM form, for tools that prefer PEM over JWKS. |

## Regenerating

Run when the receipt schema, builder, or canonicalization changes:

```bash
node scripts/generate-golden-receipt.mjs
```

then commit the regenerated `golden-*.json` and `keys/golden-public-key.pem`.

The script is plain ESM JavaScript (not TypeScript) because the
`canonicalize` npm package is ESM-only and the project's TypeScript files
are loaded via the CJS path under `tsx`. The script inlines the
receipt-building logic from `lib/compliance/receipt/builder.ts`; keep the
two in sync when the schema changes.
The script uses fixed inputs (published 32-byte seed, fixed UUID, fixed
timestamps) so the output is byte-reproducible across machines.

## Test-only keys — DO NOT REUSE

The Ed25519 keypair embedded in this directory is derived from a **published,
public seed** committed in `scripts/generate-golden-receipt.ts`. It is
intended **only** for verifying these fixtures.

- The corresponding private key is trivially derivable by anyone reading
  this repository.
- It **MUST NOT** be used to sign any real receipt, any production artifact,
  or any artifact whose authenticity matters.
- Production deployments generate their own keypair via `FileKeyProvider`
  (PEMs stored under `data/keys/`, gitignored) or via a KMS provider.

This warning is duplicated in the generation script. If you remove the
fixture keys from the test vectors, update the script and the test suite
to stop referencing them.
