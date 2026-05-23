// Ajv validator factory for ScopeContract against
// spec/v0.1/scope-contract.schema.json. Compiled once and cached.
// Mirrors lib/compliance/internal-audit/schema.ts pattern.

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schemaJson from '../../spec/v0.1/scope-contract.schema.json';

let cachedValidator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidator = ajv.compile(schemaJson);
  return cachedValidator;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: ErrorObject[] | null;
}

export function validateContract(value: unknown): ContractValidationResult {
  const validator = getValidator();
  const ok = validator(value);
  return { valid: ok, errors: ok ? null : (validator.errors ?? []) };
}

export function formatContractErrors(errors: ErrorObject[] | null): string[] {
  if (!errors) return [];
  return errors.map((e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`);
}
