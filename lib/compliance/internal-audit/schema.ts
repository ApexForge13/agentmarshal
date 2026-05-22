// Ajv validator factory for InternalAuditRecord against
// spec/v0.1/internal-audit-record.schema.json. Compiled once and cached.

import Ajv, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schemaJson from '../../../spec/v0.1/internal-audit-record.schema.json';

let cachedValidator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schemaJson);
  return cachedValidator;
}

export interface AuditRecordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateInternalAuditRecord(record: unknown): AuditRecordValidationResult {
  const validator = getValidator();
  const ok = validator(record);
  if (ok) return { valid: true, errors: [] };
  const errors = (validator.errors ?? []).map(
    (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
  );
  return { valid: false, errors };
}
