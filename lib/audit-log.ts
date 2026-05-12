// SQLite-backed audit log.
//
// TS camelCase ↔ SQL snake_case mapping happens here so the rest of the app
// can speak in the canonical TS surface. Module-level singleton DB handle.

import Database from 'better-sqlite3';
import path from 'node:path';

import type {
  Action,
  AttemptedAction,
  AuditEntry,
  LobsterTrapMetadata,
  PolicyRuleHit,
} from '@/types';

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'agentmarshal.db');

let db: Database.Database | null = null;
let currentPath: string | null = null;

export function init(dbPath?: string): void {
  const target = dbPath ?? DEFAULT_DB_PATH;
  if (db && currentPath === target) return;
  if (db) {
    db.close();
    db = null;
    currentPath = null;
  }
  db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      declared_scope TEXT,
      declared_intent TEXT,
      detected_intent TEXT,
      attempted_action TEXT,
      lobster_trap_metadata TEXT,
      agentmarshal_context TEXT,
      action TEXT NOT NULL,
      rules_fired TEXT,
      raw_input TEXT,
      dollar_impact REAL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit(action);
  `);
  currentPath = target;
}

function getDB(): Database.Database {
  if (!db) init();
  return db!;
}

export function append(
  entry: Omit<AuditEntry, 'id' | 'timestamp'> & { timestamp?: string },
): number {
  const handle = getDB();
  const timestamp = entry.timestamp ?? new Date().toISOString();

  const stmt = handle.prepare(`
    INSERT INTO audit (
      timestamp,
      agent_id,
      declared_scope,
      declared_intent,
      detected_intent,
      attempted_action,
      lobster_trap_metadata,
      agentmarshal_context,
      action,
      rules_fired,
      raw_input,
      dollar_impact
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    timestamp,
    entry.agentId,
    entry.declaredScope,
    entry.declaredIntent,
    entry.detectedIntent,
    entry.attemptedAction ? JSON.stringify(entry.attemptedAction) : null,
    JSON.stringify(entry.lobsterTrapMetadata),
    JSON.stringify(entry.agentmarshalContext ?? {}),
    entry.action,
    JSON.stringify(entry.rulesFired),
    entry.rawInput ?? null,
    entry.dollarImpact ?? null,
  );

  return Number(info.lastInsertRowid);
}

export interface QueryFilters {
  agentId?: string;
  action?: Action;
  limit?: number;
}

interface AuditRow {
  id: number;
  timestamp: string;
  agent_id: string;
  declared_scope: string | null;
  declared_intent: string | null;
  detected_intent: string | null;
  attempted_action: string | null;
  lobster_trap_metadata: string | null;
  agentmarshal_context: string | null;
  action: Action;
  rules_fired: string | null;
  raw_input: string | null;
  dollar_impact: number | null;
}

export function query(filters: QueryFilters = {}): AuditEntry[] {
  const handle = getDB();
  const limit = filters.limit ?? 100;

  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filters.agentId !== undefined) {
    clauses.push('agent_id = ?');
    params.push(filters.agentId);
  }
  if (filters.action !== undefined) {
    clauses.push('action = ?');
    params.push(filters.action);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM audit ${where} ORDER BY id DESC LIMIT ?`;
  params.push(limit);

  const rows = handle.prepare(sql).all(...params) as AuditRow[];

  return rows.map((row) => {
    const lobsterTrapMetadata = row.lobster_trap_metadata
      ? (JSON.parse(row.lobster_trap_metadata) as LobsterTrapMetadata)
      : ({} as LobsterTrapMetadata);
    const rulesFired = row.rules_fired
      ? (JSON.parse(row.rules_fired) as PolicyRuleHit[])
      : [];
    const agentmarshalContext = row.agentmarshal_context
      ? (JSON.parse(row.agentmarshal_context) as Record<string, unknown>)
      : {};
    const attemptedAction = row.attempted_action
      ? (JSON.parse(row.attempted_action) as AttemptedAction)
      : undefined;

    const entry: AuditEntry = {
      id: row.id,
      timestamp: row.timestamp,
      agentId: row.agent_id,
      declaredScope: row.declared_scope ?? '',
      declaredIntent: row.declared_intent ?? '',
      detectedIntent: row.detected_intent ?? '',
      action: row.action,
      rulesFired,
      lobsterTrapMetadata,
      agentmarshalContext,
      metadata: {},
    };
    if (attemptedAction) entry.attemptedAction = attemptedAction;
    if (row.raw_input !== null) entry.rawInput = row.raw_input;
    if (row.dollar_impact !== null) entry.dollarImpact = row.dollar_impact;
    return entry;
  });
}
