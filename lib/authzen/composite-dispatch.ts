// Registry + dispatch + fail-safe policy for composite predicates.
//
// Composite predicates are first-class: registered alongside the 13 base operators
// and produce CompositePredicateEvaluation entries under their own name in the trace.
// The fail-safe policy (`isAllowable`) lives here, not inside each predicate.

import Ajv, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { EvalContext } from './eval-context';

// 'review' (Bubble 16): a possible-match that blocks the action pending human
// review — distinct from 'fail' (hard violation) and 'stub' (unresolved input).
// Like fail/stub it is NOT allowable, so adding it changes no existing predicate
// behaviour; only entity_not_sanctioned returns it (substring SDN match).
export type CompositeResult = 'pass' | 'fail' | 'stub' | 'review';

export interface CompositePredicateEvaluation {
  predicate: string;
  result: CompositeResult;
  reason: string;
  details: Record<string, unknown>;
}

export interface CompositePredicate<TInput = unknown> {
  name: string;
  inputSchema: object;
  evaluate(input: TInput, ctx: EvalContext): Promise<CompositePredicateEvaluation>;
}

const REGISTRY = new Map<string, CompositePredicate>();
const VALIDATORS = new Map<string, ValidateFunction>();

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function registerComposite(p: CompositePredicate): void {
  REGISTRY.set(p.name, p);
  VALIDATORS.set(p.name, ajv.compile(p.inputSchema));
}

export function getComposite(name: string): CompositePredicate | undefined {
  return REGISTRY.get(name);
}

export function clearComposites(): void {
  REGISTRY.clear();
  VALIDATORS.clear();
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCompositeInput(name: string, input: unknown): ValidationResult {
  const validator = VALIDATORS.get(name);
  if (!validator) {
    return { valid: false, errors: [`unknown composite predicate: ${name}`] };
  }
  const ok = validator(input);
  if (ok) return { valid: true, errors: [] };
  const errors = (validator.errors ?? []).map(
    (e) => `${e.instancePath || '(root)'}: ${e.message ?? 'invalid'}`,
  );
  return { valid: false, errors };
}

/**
 * Fail-safe allow policy: returns true iff every composite evaluation is `pass`.
 * Stub, fail, or review → false (review blocks allow, same as the others). Empty
 * list → true (vacuous; no composites required).
 */
export function isAllowable(evals: CompositePredicateEvaluation[]): boolean {
  return evals.every((e) => e.result === 'pass');
}
