// AuthZEN audit emitter. Persists evaluation records to a separate SQLite DB.
// Day 2: minimal columns. Day 4-5: full audit-record schema columns + ed25519 signing.

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import type { AuthZenRequest, AuthZenResponse, EvaluationResult } from '@/types/authzen';

let db: Database.Database | null = null;
let dbPath: string | null = null;

function defaultDbPath(): string {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.resolve(dataDir, 'authzen-audit.db');
}

export function init(dbFilePath?: string): void {
  if (db) return;
  dbPath = dbFilePath ?? defaultDbPath();
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS authzen_audit (
      evaluation_id TEXT PRIMARY KEY,
      audit_record_version TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      contract_version INTEGER NOT NULL,
      evaluated_at TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      decision TEXT NOT NULL,
      evaluation_path TEXT NOT NULL,
      matched_rule_id TEXT,
      reason_code TEXT NOT NULL,
      reason TEXT,
      predicate_evaluations_json TEXT NOT NULL,
      logged_at TEXT NOT NULL,
      provenance TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_authzen_audit_agent ON authzen_audit(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_authzen_audit_logged_at ON authzen_audit(logged_at)`);
}

export function getDbPath(): string | null {
  return dbPath;
}

export function reset(): void {
  if (db) {
    db.close();
    db = null;
    dbPath = null;
  }
}

export function recordEvaluation(args: {
  request: AuthZenRequest;
  response: AuthZenResponse;
  result: EvaluationResult;
  evaluatedAt: Date;
}): string {
  init();
  if (!db) throw new Error('authzen-audit: DB not initialized');

  const evaluationId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO authzen_audit (
      evaluation_id, audit_record_version, agent_id, contract_id, contract_version,
      evaluated_at, request_json, response_json, decision, evaluation_path,
      matched_rule_id, reason_code, reason, predicate_evaluations_json, logged_at, provenance
    ) VALUES (
      @evaluation_id, @audit_record_version, @agent_id, @contract_id, @contract_version,
      @evaluated_at, @request_json, @response_json, @decision, @evaluation_path,
      @matched_rule_id, @reason_code, @reason, @predicate_evaluations_json, @logged_at, @provenance
    )
  `).run({
    evaluation_id: evaluationId,
    audit_record_version: '0.1',
    agent_id: args.request.subject.id,
    contract_id: 'stub-allow-v0.2-day-2',
    contract_version: 1,
    evaluated_at: args.evaluatedAt.toISOString(),
    request_json: JSON.stringify(args.request),
    response_json: JSON.stringify(args.response),
    decision: args.result.effect,
    evaluation_path: args.result.evaluation_path,
    matched_rule_id: args.result.matched_rule_id,
    reason_code: args.result.reason_code,
    reason: args.result.reason,
    predicate_evaluations_json: JSON.stringify(args.result.predicate_evaluations),
    logged_at: now,
    provenance: null,
  });

  return evaluationId;
}
