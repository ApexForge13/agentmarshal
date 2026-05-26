// Public Compliance Receipt / Internal Audit verification.
//
// Reverses EXACTLY what the emitters do (lib/compliance/receipt/builder.ts +
// lib/compliance/internal-audit/builder.ts): the Ed25519 signature is over the
// RFC 8785 (JCS) canonical form of the record body MINUS its hash field and the
// signatures array. For Compliance Receipts the response-level `record_type` is
// NOT part of the signed bytes (the emitter adds it at the API wrapper), so it
// is stripped too; for Internal Audit records `record_type` IS in the signed
// body and must be retained.
//
// No new crypto: canonicalize + Ed25519 verify are the same primitives signing
// uses, called in reverse.

import { canonicalize } from '@/lib/compliance/receipt/canonical';
import { verify as verifyEd25519 } from '@/lib/compliance/receipt/verify';
import { verifyTimestampToken } from '@/lib/compliance/timestamp/verify-timestamp';
import type { TimestampResult } from '@/lib/compliance/timestamp/types';
import { loadPublicKey } from './load-public-key';

export type RecordTypeDiscriminant = 'compliance_receipt' | 'internal_audit' | 'unknown';

export interface VerifyDetails {
  agent_id: string;
  decision: string;
  composites_fired: string[];
  issued_at: string;
  previous_receipt_hash: string | null;
  // Bubble 16 three-state: true when this record blocked the action pending human
  // review (top-level review_required on the signed body). false on pre-Bubble-16
  // records (the field is absent). The field is part of the signed bytes, so a
  // tampered review_required flips the signature verdict — no separate check needed.
  review_required: boolean;
}

export interface VerifyResult {
  verified: boolean;
  record_type: RecordTypeDiscriminant;
  reason: string;
  details?: VerifyDetails;
  // RFC 3161 external timestamp verdict, reported SEPARATELY from signature
  // validity: a receipt can be { verified: true, timestamp: unavailable } (signed
  // but no third-party time anchor) or { verified: false, timestamp: timestamped }
  // (a real time anchor over a since-tampered body).
  timestamp: TimestampResult;
}

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function discriminate(obj: Obj): RecordTypeDiscriminant {
  if (obj.record_type === 'internal_audit' || 'audit_hash' in obj) return 'internal_audit';
  if (
    obj.record_type === 'compliance_receipt' ||
    'receipt_hash' in obj ||
    'receipt_version' in obj
  ) {
    return 'compliance_receipt';
  }
  return 'unknown';
}

/** Reconstruct the exact body that was canonicalized + signed by the emitter. */
function buildSignedBody(recordType: RecordTypeDiscriminant, obj: Obj): Obj {
  const body: Obj = { ...obj };
  delete body.signatures;
  delete body.timestamp_token; // attached after signing (like signatures); never signed
  if (recordType === 'compliance_receipt') {
    delete body.receipt_hash;
    delete body.record_type; // synthetic wrapper field, never in receipt's signed bytes
  } else {
    delete body.audit_hash; // record_type is intrinsic to the signed body — keep it
  }
  return body;
}

/** Verdict for the envelope's external timestamp, independent of the signature. */
function computeTimestampResult(recordType: RecordTypeDiscriminant, obj: Obj): TimestampResult {
  const tt = obj.timestamp_token;
  if (tt === null || tt === undefined) {
    return { status: 'unavailable', reason: 'no external timestamp anchor on this receipt' };
  }
  if (!isObject(tt) || typeof tt.token_b64 !== 'string') {
    return { status: 'invalid', reason: 'timestamp_token is present but malformed' };
  }
  const hashHex =
    recordType === 'internal_audit'
      ? typeof obj.audit_hash === 'string'
        ? obj.audit_hash
        : ''
      : typeof obj.receipt_hash === 'string'
        ? obj.receipt_hash
        : '';
  return verifyTimestampToken({ tokenB64: tt.token_b64, expectedHashHex: hashHex });
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => (isObject(e) && typeof e.predicate === 'string' ? e.predicate : null))
    .filter((s): s is string => s !== null);
}

function extractDetails(recordType: RecordTypeDiscriminant, obj: Obj): VerifyDetails {
  if (recordType === 'internal_audit') {
    const agent = isObject(obj.agent) ? obj.agent : {};
    const evaluation = isObject(obj.evaluation) ? obj.evaluation : {};
    const decision = isObject(evaluation.decision) ? evaluation.decision : {};
    return {
      agent_id: typeof agent.id === 'string' ? agent.id : '',
      decision: typeof decision.effect === 'string' ? decision.effect : '',
      composites_fired: asStringArray(evaluation.composite_evaluations),
      issued_at: typeof obj.issued_at === 'string' ? obj.issued_at : '',
      previous_receipt_hash:
        typeof obj.previous_audit_hash === 'string' ? obj.previous_audit_hash : null,
      review_required: obj.review_required === true,
    };
  }
  const decision = isObject(obj.decision) ? obj.decision : {};
  return {
    agent_id: typeof obj.agent_id === 'string' ? obj.agent_id : '',
    decision: typeof decision.effect === 'string' ? decision.effect : '',
    composites_fired: asStringArray(obj.composite_evaluations),
    issued_at: typeof obj.issued_at === 'string' ? obj.issued_at : '',
    previous_receipt_hash:
      typeof obj.previous_receipt_hash === 'string' ? obj.previous_receipt_hash : null,
    review_required: obj.review_required === true,
  };
}

/**
 * Verify a pasted receipt/audit-envelope JSON object against AgentMarshal's
 * published public key. Returns a structured verdict — never throws on bad
 * input; malformed/unknown shapes return verified:false with a specific reason.
 */
export async function verifyReceipt(input: unknown): Promise<VerifyResult> {
  if (!isObject(input)) {
    return {
      verified: false,
      record_type: 'unknown',
      reason: 'receipt must be a JSON object',
      timestamp: { status: 'unavailable', reason: 'not a recognized receipt' },
    };
  }

  const recordType = discriminate(input);
  if (recordType === 'unknown') {
    return {
      verified: false,
      record_type: 'unknown',
      reason: 'unknown record_type: not a Compliance Receipt or Internal Audit envelope',
      timestamp: { status: 'unavailable', reason: 'not a recognized receipt' },
    };
  }

  // Timestamp validity is independent of the signature — compute it once and
  // report it on every path for a recognized record.
  const timestamp = computeTimestampResult(recordType, input);

  const signatures = input.signatures;
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return { verified: false, record_type: recordType, reason: 'missing signature field', timestamp };
  }
  const sig = signatures[0];
  if (!isObject(sig) || typeof sig.signature !== 'string') {
    return { verified: false, record_type: recordType, reason: 'missing signature field', timestamp };
  }

  let canonical: Buffer;
  try {
    canonical = canonicalize(buildSignedBody(recordType, input));
  } catch {
    return {
      verified: false,
      record_type: recordType,
      reason: 'receipt body is not canonicalizable (non-JSON-serializable content)',
      timestamp,
    };
  }

  const { raw, info } = await loadPublicKey();
  const ok = verifyEd25519({
    canonicalBytes: canonical,
    signatureHex: sig.signature,
    publicKeyRaw: raw,
    algorithm: 'ed25519',
  });

  if (!ok) {
    const fp = sig.public_key_fingerprint;
    const reason =
      typeof fp === 'string' && fp !== info.public_key_fingerprint
        ? `signature mismatch: signed by a different key (fingerprint ${fp} ≠ published ${info.public_key_fingerprint})`
        : 'signature mismatch';
    return { verified: false, record_type: recordType, reason, timestamp };
  }

  // Timestamp/issued_at cross-check (Bubble 12). A signature-valid receipt can still
  // be backdated: an operator re-signs a receipt with an earlier issued_at to claim
  // "we ran this check before the violation." The RFC 3161 token's genTime is signed
  // by the TSA and cannot be moved, so when a verifying timestamp is present we
  // require issued_at to sit within ±5 minutes of it (clock skew + TSA roundtrip;
  // tighter false-positives, looser misses reasonable backdating). The authoritative
  // time is timestamp.timestamp_at — the genTime re-derived from the signed token,
  // NOT the self-reported timestamp_token.issued_at (which an operator could edit).
  const crossCheck = crossCheckIssuedAt(recordType, input, timestamp);
  if (crossCheck) return crossCheck;

  return {
    verified: true,
    record_type: recordType,
    reason: 'signature valid: receipt is authentic and unmodified',
    details: extractDetails(recordType, input),
    timestamp,
  };
}

const ISSUED_AT_TOLERANCE_MS = 5 * 60 * 1000;

/** Returns a verified:false verdict when issued_at and the verifying external
 *  timestamp disagree beyond tolerance; null when they agree (or no verifying
 *  timestamp / no parseable issued_at exists to check). */
function crossCheckIssuedAt(
  recordType: RecordTypeDiscriminant,
  obj: Obj,
  timestamp: TimestampResult,
): VerifyResult | null {
  if (timestamp.status !== 'timestamped') return null;
  const issuedMs = typeof obj.issued_at === 'string' ? Date.parse(obj.issued_at) : NaN;
  const genMs = Date.parse(timestamp.timestamp_at);
  if (Number.isNaN(issuedMs) || Number.isNaN(genMs)) return null;

  const skewMs = genMs - issuedMs; // > 0 ⇒ issued_at precedes the external timestamp
  if (skewMs > ISSUED_AT_TOLERANCE_MS) {
    return {
      verified: false,
      record_type: recordType,
      reason:
        `issued_at predates external timestamp by ${Math.round(skewMs / 60000)} min ` +
        `(issued_at ${new Date(issuedMs).toISOString()} vs TSA genTime ${timestamp.timestamp_at}); receipt appears backdated`,
      timestamp,
    };
  }
  if (skewMs < -ISSUED_AT_TOLERANCE_MS) {
    return {
      verified: false,
      record_type: recordType,
      reason:
        `issued_at significantly later than external timestamp by ${Math.round(-skewMs / 60000)} min ` +
        `(issued_at ${new Date(issuedMs).toISOString()} vs TSA genTime ${timestamp.timestamp_at})`,
      timestamp,
    };
  }
  return null;
}
