// Ajv validator factory for ComplianceReceipt against spec/v0.1/compliance-receipt.schema.json.
// Compiled once and cached; the validator is the authoritative gate that buildReceipt() runs
// before returning and that consumers run on inbound receipts.

import Ajv, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schemaJson from '../../../spec/v0.1/compliance-receipt.schema.json';

let cachedValidator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schemaJson);
  return cachedValidator;
}

export interface ReceiptValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateReceipt(receipt: unknown): ReceiptValidationResult {
  const validator = getValidator();
  const ok = validator(receipt);
  if (ok) return { valid: true, errors: [] };
  const errors = (validator.errors ?? []).map(
    (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
  );
  return { valid: false, errors };
}
