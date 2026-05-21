// Deterministically regenerates tests/vectors/golden-* files.
//
// Run when the receipt schema or builder changes:
//   node scripts/generate-golden-receipt.mjs
// then commit the regenerated outputs.
//
// All inputs are fixed: a published 32-byte seed derives the test keypair,
// a fixed UUID seeds the receipt_id, and fixed timestamps seed issued_at and
// signed_at. Ed25519 signing is deterministic over canonical input bytes, so
// the resulting signature and receipt_hash are byte-reproducible.
//
// IMPORTANT: this script is plain ESM JavaScript (not TypeScript) and inlines
// the receipt-construction logic. The project's lib/compliance/receipt/builder.ts
// is CJS-loaded by tsx and cannot statically import the ESM-only `canonicalize`
// package from a script context. The inlined logic is structurally identical to
// the builder's; keep them in sync when the schema or builder changes.

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
} from 'crypto';
import canonicalize from 'canonicalize';

const TEST_SEED_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const FIXED_RECEIPT_ID = '11111111-2222-4333-8444-555555555555';
const FIXED_ISSUED_AT = '2026-05-21T00:00:00.000Z';
const FIXED_SIGNED_AT = '2026-05-21T00:00:00.500Z';

// Ed25519 PKCS#8 DER prefix: 16 fixed bytes followed by the 32-byte raw seed.
// RFC 8410 + RFC 5958 — the inner OCTET STRING wraps the 32-byte private seed.
const ED25519_PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex',
);

const VECTORS_DIR = join(process.cwd(), 'tests', 'vectors');
const KEYS_DIR = join(VECTORS_DIR, 'keys');

function canonicalBytes(value) {
  const str = canonicalize(value);
  if (str === undefined) {
    throw new Error('canonicalize() returned undefined');
  }
  return Buffer.from(str, 'utf8');
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jwkThumbprint(rawPub) {
  const jwk = { crv: 'Ed25519', kty: 'OKP', x: rawPub.toString('base64url') };
  return createHash('sha256').update(canonicalBytes(jwk)).digest('base64url');
}

function deriveKeyId(rawPub) {
  return `am-${jwkThumbprint(rawPub)}`;
}

function publicKeyFingerprint(rawPub) {
  return sha256Hex(rawPub);
}

async function main() {
  const seed = Buffer.from(TEST_SEED_HEX, 'hex');
  if (seed.length !== 32) {
    throw new Error(`expected 32-byte seed, got ${seed.length}`);
  }
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);

  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') {
    throw new Error('expected Ed25519 JWK with x field');
  }
  const rawPub = Buffer.from(jwk.x, 'base64url');
  const keyId = deriveKeyId(rawPub);
  const fingerprint = publicKeyFingerprint(rawPub);

  const body = {
    receipt_version: '0.1',
    schema_version: '0.1',
    receipt_id: FIXED_RECEIPT_ID,
    previous_receipt_hash: null,
    canonical_form: 'rfc8785',
    issued_at: FIXED_ISSUED_AT,
    code_version: 'golden-fixture',
    contract_id: 'contract-golden',
    contract_version: '0.1',
    tenant_id: 'tenant-golden',
    agent_id: 'agent-golden',
    evaluation_id: 'eval-golden',
    request_id: 'req-golden',
    decision: {
      effect: 'allow',
      evaluation_path: 'declared_scope',
      matched_rule_id: 'voice-sales-business-hours',
      reason_code: 'TCPA_OK',
      reason: 'within business hours, consent confirmed',
    },
    predicate_evaluations: [
      {
        rule_id: 'voice-sales-business-hours',
        predicate_path: 'action.name',
        constraint: { equals: 'place_call' },
        actual_value: 'place_call',
        result: 'pass',
      },
    ],
    composite_evaluations: [
      {
        predicate: 'tcpa_quiet_hours_respected',
        result: 'pass',
        reason: 'within allowed window',
        details: {
          recipient_local_time: '14:30',
          effective_window: { start: '08:00', end: '21:00' },
        },
      },
      {
        predicate: 'tcpa_consent_present',
        result: 'pass',
        reason: 'written_express consent on file',
        details: {
          call_type: 'sales',
          actual_level: 'written_express',
        },
      },
    ],
    regulatory_state: {
      hash: null,
      pending: true,
      snapshot_source: null,
      anchor_timestamp: null,
      anchor_method: 'pending',
    },
  };

  const canonicalBody = canonicalBytes(body);
  const signatureBytes = nodeSign(null, canonicalBody, privateKey);

  const signatures = [
    {
      algorithm: 'ed25519',
      key_id: keyId,
      public_key_fingerprint: fingerprint,
      signature: signatureBytes.toString('hex'),
      signed_at: FIXED_SIGNED_AT,
      signer_role: 'agentmarshal',
    },
  ];

  const preHashReceipt = { ...body, signatures };
  const receipt_hash = sha256Hex(canonicalBytes(preHashReceipt));
  const receipt = { ...preHashReceipt, receipt_hash };

  mkdirSync(VECTORS_DIR, { recursive: true });
  mkdirSync(KEYS_DIR, { recursive: true });

  const receiptPath = join(VECTORS_DIR, 'golden-receipt.json');
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

  const jwks = {
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        x: rawPub.toString('base64url'),
        kid: keyId,
      },
    ],
  };
  const jwksPath = join(VECTORS_DIR, 'golden-jwks.json');
  writeFileSync(jwksPath, JSON.stringify(jwks, null, 2) + '\n');

  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' });
  const pemPath = join(KEYS_DIR, 'golden-public-key.pem');
  writeFileSync(pemPath, publicKeyPem);

  console.log('Wrote:');
  console.log(`  ${receiptPath}`);
  console.log(`  ${jwksPath}`);
  console.log(`  ${pemPath}`);
  console.log(`key_id: ${keyId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
