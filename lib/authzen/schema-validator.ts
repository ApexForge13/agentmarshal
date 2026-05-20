// Ajv-backed validation against published JSON Schemas (spec/v0.1/) + the AuthZEN request wire shape.
// Single Ajv instance, singleton-initialized on first call.

import Ajv, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import path from 'path';
import fs from 'fs';

let ajv: Ajv | null = null;
let validateRequestFn: ValidateFunction | null = null;
let validateScopeContractFn: ValidateFunction | null = null;
let validateAuditRecordFn: ValidateFunction | null = null;

function loadSchema(schemaFile: string): object {
  const fullPath = path.resolve(process.cwd(), 'spec', 'v0.1', schemaFile);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`schema-validator: cannot find schema at ${fullPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

function init(): void {
  if (ajv) return;
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  ajv.addSchema(loadSchema('scope-contract.schema.json'), 'scope-contract');
  ajv.addSchema(loadSchema('audit-record.schema.json'), 'audit-record');

  validateScopeContractFn = ajv.getSchema('scope-contract') ?? null;
  validateAuditRecordFn = ajv.getSchema('audit-record') ?? null;

  // AuthZEN request shape — hand-rolled (no published JSON Schema for AuthZEN requests yet).
  validateRequestFn = ajv.compile({
    type: 'object',
    required: ['subject', 'action', 'resource'],
    properties: {
      subject: {
        type: 'object',
        required: ['type', 'id'],
        properties: {
          type: { type: 'string', minLength: 1 },
          id: { type: 'string', minLength: 1 },
          properties: { type: 'object' },
        },
        additionalProperties: true,
      },
      action: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          properties: { type: 'object' },
        },
        additionalProperties: true,
      },
      resource: {
        type: 'object',
        required: ['type', 'id'],
        properties: {
          type: { type: 'string', minLength: 1 },
          id: { type: 'string', minLength: 1 },
          properties: { type: 'object' },
        },
        additionalProperties: true,
      },
      context: { type: 'object' },
    },
    additionalProperties: false,
  });
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function formatErrors(errors: unknown[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((e: any) => {
    const inst = e.instancePath || '(root)';
    return `${inst}: ${e.message ?? 'invalid'}`;
  });
}

export function validateAuthZenRequest(body: unknown): ValidationResult {
  init();
  const ok = validateRequestFn!(body);
  return { valid: ok, errors: ok ? [] : formatErrors(validateRequestFn!.errors) };
}

export function validateScopeContract(contract: unknown): ValidationResult {
  init();
  const ok = validateScopeContractFn!(contract);
  return { valid: ok, errors: ok ? [] : formatErrors(validateScopeContractFn!.errors) };
}

export function validateAuditRecord(record: unknown): ValidationResult {
  init();
  const ok = validateAuditRecordFn!(record);
  return { valid: ok, errors: ok ? [] : formatErrors(validateAuditRecordFn!.errors) };
}
