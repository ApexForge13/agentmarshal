// Deterministic builder for the audit-trail tampering fixtures + scenarios (Bubble 12).
// Same pattern as lib/verify/build-examples.ts: calls the REAL emit-and-sign helpers
// with fixed seed data so the output is byte-stable across runs (Ed25519 is
// deterministic; ids / issued_at / signed_at are pinned). Re-runnable via
// scripts/generate-audit-trail-fixtures.mts.
//
// Generates five tamper artifacts the verifier must catch (plus a valid baseline):
//   - valid_receipt       a genuine Compliance Receipt with full sig + real timestamp
//   - tampered_receipt     decision flipped deny→permit AFTER signing (signature breaks)
//   - valid_chain          3 receipts correctly hash-chained
//   - broken_chain         3 receipts where the middle one's back-link points to a
//                          removed (deny) receipt, not the presented predecessor
//   - backdated_receipt    issued_at moved 10 min before the RFC 3161 genTime, re-signed
//   - forged_receipt       signed by a non-AgentMarshal (ephemeral, seed-derived) key
//
// NOTE: imports the ESM-only `canonicalize` chain transitively, so this module must run
// under an ESM-capable resolver (vitest) — never tsx-CJS.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
} from 'crypto';
import { buildReceipt } from '@/lib/compliance/receipt/builder';
import { canonicalize } from '@/lib/compliance/receipt/canonical';
import { sign } from '@/lib/compliance/receipt/sign';
import { FileKeyProvider } from '@/lib/compliance/keys/file-provider';
import { publicKeyFingerprint, deriveKeyId } from '@/lib/compliance/keys/fingerprint';
import { buildExamples } from '@/lib/verify/build-examples';
import type { EvaluationResult } from '@/types/authzen';
import type { Timestamper } from '@/lib/compliance/timestamp/types';
import type { SigningHandle } from '@/lib/compliance/keys/provider';
import type { BenchmarkScenario } from './types';

const CODE_VERSION = 'agentmarshal-v0.2-bubble12';
const BACKDATE_MS = 10 * 60 * 1000; // 10 minutes — well beyond the 5-min cross-check tolerance

// Fixed seeds for the chain + forged receipts (no external timestamp on these, so any
// stable issued_at works; the chain catch is linkage, the forged catch is the key).
const CHAIN_AGENT = 'voice-001';
const CHAIN_EVAL_ID = '5e000000-0000-4000-8000-00000000eva1';
const CHAIN_REQ_ID = '5e000000-0000-4000-8000-00000000req1';

// A non-allow decision body shared by the chain + forged receipts. Mirrors the
// known-schema-valid shape used by the /verify examples (≥1 predicate_evaluation).
const CHAIN_DENY: EvaluationResult = {
  effect: 'deny',
  evaluation_path: 'no_match',
  matched_rule_id: null,
  out_of_scope_term: null,
  reason_code: 'NO_MATCH_IMPLICIT_DENY',
  reason: 'No declared_scope rule matched; implicit deny per Scope Contract semantics.',
  predicate_evaluations: [
    {
      rule_id: 'chain-base',
      predicate_path: 'subject.id',
      constraint: { exists: true },
      actual_value: CHAIN_AGENT,
      result: 'pass',
      reason: 'subject.id is present',
    },
  ],
  composite_evaluations: [],
};

export interface AuditTrailFixtures {
  valid_receipt: Record<string, unknown>;
  tampered_receipt: Record<string, unknown>;
  valid_chain: Record<string, unknown>[];
  broken_chain: Record<string, unknown>[];
  backdated_receipt: Record<string, unknown>;
  forged_receipt: Record<string, unknown>;
}

export interface BuildAuditTrailFixturesOptions {
  // Replay timestamper so valid_receipt + backdated_receipt carry a real (offline)
  // FreeTSA token. Same instance the /verify examples use.
  timestamper: Timestamper;
  // The capture issued_at (from freetsa-tokens.json) so valid_receipt's receipt_hash
  // matches the captured token — identical to the /verify example generation.
  issuedAt: Date;
}

/** A receipt as it leaves the API: record_type attached at the response wrapper. */
function withType(receipt: Record<string, unknown>): Record<string, unknown> {
  return { record_type: 'compliance_receipt', ...receipt };
}

/** The exact bytes the emitter signed for a Compliance Receipt: body minus the hash,
 *  the signatures array, the attached timestamp, and the synthetic record_type wrapper.
 *  Mirrors buildSignedBody() in lib/verify/verify-receipt.ts. */
function complianceSignedBody(receipt: Record<string, unknown>): Record<string, unknown> {
  const body = { ...receipt };
  delete body.signatures;
  delete body.timestamp_token;
  delete body.receipt_hash;
  delete body.record_type;
  return body;
}

async function buildChainReceipt(
  handle: SigningHandle,
  opts: { receiptId: string; previousReceiptHash: string | null; issuedAt: Date },
): Promise<Record<string, unknown>> {
  const receipt = await buildReceipt({
    evaluationResult: CHAIN_DENY,
    tenantId: 'default',
    agentId: CHAIN_AGENT,
    contractId: 'voice_v1',
    contractVersion: '0.1',
    evaluationId: CHAIN_EVAL_ID,
    requestId: CHAIN_REQ_ID,
    codeVersion: CODE_VERSION,
    previousReceiptHash: opts.previousReceiptHash,
    issuedAt: opts.issuedAt,
    receiptId: opts.receiptId,
    signers: [{ handle, role: 'agentmarshal', signedAt: opts.issuedAt }],
    // no timestamper — chain integrity is independent of external timestamping
  });
  return withType(receipt as unknown as Record<string, unknown>);
}

// ── Forged key ──────────────────────────────────────────────────────────────────────
// Deterministic ephemeral Ed25519 key, NOT AgentMarshal's. The 32-byte seed is
// sha256(fixed phrase); it is wrapped in the standard PKCS#8 prefix for Ed25519
// (302e020100300506032b657004220420 = SEQUENCE{INTEGER 0, AlgId{1.3.101.112}, OCTET
// STRING{OCTET STRING(32)}}). Ed25519 key derivation from a seed (RFC 8032) and the
// DER framing are both fully specified, so the resulting key — and every signature it
// produces over fixed canonical bytes — is byte-stable across Node/OpenSSL versions.
const FORGED_KEY_SEED_PHRASE = 'agentmarshal-bubble12-forged-audit-key-v1';

function makeForgedHandle(): SigningHandle {
  const seed = createHash('sha256').update(FORGED_KEY_SEED_PHRASE).digest(); // 32 bytes
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed,
  ]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('forged key: expected Ed25519 JWK with x');
  const rawPub = Buffer.from(jwk.x, 'base64url');
  return {
    keyMaterial: {
      key_id: deriveKeyId(rawPub),
      algorithm: 'ed25519',
      public_key_raw: rawPub,
      public_key_fingerprint: publicKeyFingerprint(rawPub),
      created_at: '2026-01-01T00:00:00.000Z', // fixed; not part of the receipt bytes
    },
    sign: async (canonicalBytes: Buffer): Promise<Buffer> =>
      nodeSign(null, canonicalBytes, privateKey),
  };
}

export async function buildAuditTrailFixtures(
  opts: BuildAuditTrailFixturesOptions,
): Promise<AuditTrailFixtures> {
  const handle = await new FileKeyProvider().getActiveSigningHandle();

  // valid_receipt + tampered_receipt: reuse the /verify example generation so the valid
  // receipt carries the SAME real FreeTSA timestamp (its hash matches the captured token).
  const examples = await buildExamples({ timestamper: opts.timestamper, issuedAt: opts.issuedAt });
  const valid_receipt = examples.valid_compliance;
  const tampered_receipt = examples.tampered_compliance;

  // ── backdated_receipt ──────────────────────────────────────────────────────────────
  // The token's genTime is signed by the TSA and immutable. Move issued_at 10 min before
  // it and re-sign over the modified body so the SIGNATURE is valid — but keep receipt_hash
  // and timestamp_token untouched (they still describe the genuine, genTime-consistent
  // state; the operator cannot re-stamp the past). The only break is issued_at vs genTime,
  // which verifyReceipt's cross-check catches. receipt_hash is intentionally NOT recomputed:
  // it must keep matching the token so the timestamp still verifies and exposes the real time.
  const genTime = new Date(
    (valid_receipt.timestamp_token as { issued_at: string }).issued_at,
  );
  const backdatedIssuedAt = new Date(genTime.getTime() - BACKDATE_MS);
  const backdated_receipt = structuredClone(valid_receipt) as Record<string, unknown>;
  backdated_receipt.issued_at = backdatedIssuedAt.toISOString();
  const reSig = await sign(canonicalize(complianceSignedBody(backdated_receipt)), handle);
  const origSig = (valid_receipt.signatures as Array<Record<string, unknown>>)[0];
  backdated_receipt.signatures = [
    {
      algorithm: reSig.algorithm,
      key_id: reSig.key_id,
      public_key_fingerprint: reSig.public_key_fingerprint,
      signature: reSig.signature_hex,
      signed_at: backdatedIssuedAt.toISOString(),
      signer_role: origSig.signer_role,
    },
  ];

  // ── valid_chain ──────────────────────────────────────────────────────────────────
  const c1 = await buildChainReceipt(handle, {
    receiptId: '0a000001-0000-4000-8000-000000000001',
    previousReceiptHash: null,
    issuedAt: new Date('2026-05-24T10:00:00.000Z'),
  });
  const c2 = await buildChainReceipt(handle, {
    receiptId: '0a000002-0000-4000-8000-000000000002',
    previousReceiptHash: c1.receipt_hash as string,
    issuedAt: new Date('2026-05-24T10:01:00.000Z'),
  });
  const c3 = await buildChainReceipt(handle, {
    receiptId: '0a000003-0000-4000-8000-000000000003',
    previousReceiptHash: c2.receipt_hash as string,
    issuedAt: new Date('2026-05-24T10:02:00.000Z'),
  });
  const valid_chain = [c1, c2, c3];

  // ── broken_chain ───────────────────────────────────────────────────────────────────
  // Intact history: b1 → b_removed(deny) → b2 → b3. The operator deletes b_removed to hide
  // a 'deny'. The PRESENTED chain is [b1, b2, b3]: every receipt still signature-verifies and
  // its own receipt_hash is correct, but b2.previous_receipt_hash points to the deleted
  // b_removed, not to b1 — a single, purely-relational break at index 1.
  const b1 = await buildChainReceipt(handle, {
    receiptId: '0b000001-0000-4000-8000-000000000001',
    previousReceiptHash: null,
    issuedAt: new Date('2026-05-24T09:00:00.000Z'),
  });
  const bRemoved = await buildChainReceipt(handle, {
    receiptId: '0b000009-0000-4000-8000-000000000009',
    previousReceiptHash: b1.receipt_hash as string,
    issuedAt: new Date('2026-05-24T09:01:00.000Z'),
  });
  const b2 = await buildChainReceipt(handle, {
    receiptId: '0b000002-0000-4000-8000-000000000002',
    previousReceiptHash: bRemoved.receipt_hash as string,
    issuedAt: new Date('2026-05-24T09:02:00.000Z'),
  });
  const b3 = await buildChainReceipt(handle, {
    receiptId: '0b000003-0000-4000-8000-000000000003',
    previousReceiptHash: b2.receipt_hash as string,
    issuedAt: new Date('2026-05-24T09:03:00.000Z'),
  });
  const broken_chain = [b1, b2, b3]; // b_removed excluded — the hidden 'deny'

  // ── forged_receipt ───────────────────────────────────────────────────────────────
  const forged = await buildReceipt({
    evaluationResult: CHAIN_DENY,
    tenantId: 'default',
    agentId: CHAIN_AGENT,
    contractId: 'voice_v1',
    contractVersion: '0.1',
    evaluationId: CHAIN_EVAL_ID,
    requestId: CHAIN_REQ_ID,
    codeVersion: CODE_VERSION,
    previousReceiptHash: null,
    issuedAt: new Date('2026-05-24T11:00:00.000Z'),
    receiptId: '0f000001-0000-4000-8000-00000000000f',
    signers: [
      { handle: makeForgedHandle(), role: 'agentmarshal', signedAt: new Date('2026-05-24T11:00:00.000Z') },
    ],
    // no timestamper — the catch is the foreign signing key, not the timestamp
  });
  const forged_receipt = withType(forged as unknown as Record<string, unknown>);

  return {
    valid_receipt,
    tampered_receipt,
    valid_chain,
    broken_chain,
    backdated_receipt,
    forged_receipt,
  };
}

/** Assemble the 5 audit_trail benchmark scenarios with their targets inlined. */
export function buildAuditTrailScenarios(fixtures: AuditTrailFixtures): BenchmarkScenario[] {
  return [
    {
      id: 'audit_trail-01-adv-tampered-receipt',
      category: 'audit_trail',
      adversarial: true,
      description:
        "Operator modifies a receipt's decision field from 'deny' to 'permit' after signing to fake an approval.",
      target: { kind: 'single', receipt: fixtures.tampered_receipt },
      expected: 'catch',
    },
    {
      id: 'audit_trail-02-adv-broken-chain',
      category: 'audit_trail',
      adversarial: true,
      description:
        "Operator removes a 'deny' receipt from the middle of an audit chain to hide a violation. The next receipt's previous_receipt_hash no longer chains.",
      target: { kind: 'chain', receipts: fixtures.broken_chain },
      expected: 'catch',
    },
    {
      id: 'audit_trail-03-adv-backdated-receipt',
      category: 'audit_trail',
      adversarial: true,
      description:
        "Operator predates issued_at to claim 'we ran this check before the violation occurred,' but the embedded RFC 3161 token's genTime tells the real story.",
      target: { kind: 'single', receipt: fixtures.backdated_receipt },
      expected: 'catch',
    },
    {
      id: 'audit_trail-04-adv-forged-signature',
      category: 'audit_trail',
      adversarial: true,
      description:
        "Operator signs a receipt with a non-canonical Ed25519 key (different fingerprint than AgentMarshal's published key) to forge an audit entry.",
      target: { kind: 'single', receipt: fixtures.forged_receipt },
      expected: 'catch',
    },
    {
      id: 'audit_trail-05-legit-offline-verification',
      category: 'audit_trail',
      adversarial: false,
      description:
        'Regulator verifies a valid receipt with ONLY the receipt JSON and the published public key — no AgentMarshal access. Capability check: can the system support out-of-band verification at all?',
      target: { kind: 'single', receipt: fixtures.valid_receipt },
      expected: 'permit',
    },
  ];
}
