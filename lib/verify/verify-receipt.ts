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
import { loadPublicKey } from './load-public-key';

export type RecordTypeDiscriminant = 'compliance_receipt' | 'internal_audit' | 'unknown';

export interface VerifyDetails {
  agent_id: string;
  decision: string;
  composites_fired: string[];
  issued_at: string;
  previous_receipt_hash: string | null;
}

export interface VerifyResult {
  verified: boolean;
  record_type: RecordTypeDiscriminant;
  reason: string;
  details?: VerifyDetails;
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
  if (recordType === 'compliance_receipt') {
    delete body.receipt_hash;
    delete body.record_type; // synthetic wrapper field, never in receipt's signed bytes
  } else {
    delete body.audit_hash; // record_type is intrinsic to the signed body — keep it
  }
  return body;
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
  };
}

/**
 * Verify a pasted receipt/audit-envelope JSON object against AgentMarshal's
 * published public key. Returns a structured verdict — never throws on bad
 * input; malformed/unknown shapes return verified:false with a specific reason.
 */
export async function verifyReceipt(input: unknown): Promise<VerifyResult> {
  if (!isObject(input)) {
    return { verified: false, record_type: 'unknown', reason: 'receipt must be a JSON object' };
  }

  const recordType = discriminate(input);
  if (recordType === 'unknown') {
    return {
      verified: false,
      record_type: 'unknown',
      reason: 'unknown record_type: not a Compliance Receipt or Internal Audit envelope',
    };
  }

  const signatures = input.signatures;
  if (!Array.isArray(signatures) || signatures.length === 0) {
    return { verified: false, record_type: recordType, reason: 'missing signature field' };
  }
  const sig = signatures[0];
  if (!isObject(sig) || typeof sig.signature !== 'string') {
    return { verified: false, record_type: recordType, reason: 'missing signature field' };
  }

  let canonical: Buffer;
  try {
    canonical = canonicalize(buildSignedBody(recordType, input));
  } catch {
    return {
      verified: false,
      record_type: recordType,
      reason: 'receipt body is not canonicalizable (non-JSON-serializable content)',
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
    return { verified: false, record_type: recordType, reason };
  }

  return {
    verified: true,
    record_type: recordType,
    reason: 'signature valid: receipt is authentic and unmodified',
    details: extractDetails(recordType, input),
  };
}
