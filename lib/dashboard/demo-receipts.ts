// Server-only loader for the persisted demo-receipt fixtures shown in /receipts.
//
// These are REAL signed Internal Audit records captured by
// tests/demo/capture-demo-receipts.test.ts: a live AI/ML API adverse-media verdict +
// reasoning, a real FileKeyProvider Ed25519 signature, and a real FreeTSA RFC 3161
// timestamp anchor, chained via previous_audit_hash. They are read from disk at request
// time so adding a captured fixture needs no code change. fs import keeps this module
// server-only — never import it from a Client Component.

import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import type { SignedRecord } from './feed';

const DIR = path.resolve(process.cwd(), 'data/demo-receipts');

// Narrative order (the file's own newest-first sort is by issued_at; this only breaks
// ties / orders the curated set when timestamps are within the same second of capture).
const PREFERRED_ORDER = [
  'helix-bridge-fail',
  'meridian-collision',
  'northwind-clean',
  'governance-deny-passthrough',
];

function issuedAtMs(r: SignedRecord): number {
  const t = typeof r['issued_at'] === 'string' ? Date.parse(r['issued_at'] as string) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Read every data/demo-receipts/*.json fixture, newest-first. Returns [] if absent. */
export function loadDemoReceipts(): SignedRecord[] {
  let files: string[];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const records: Array<{ slug: string; record: SignedRecord }> = [];
  for (const f of files) {
    try {
      const record = JSON.parse(readFileSync(path.resolve(DIR, f), 'utf8')) as SignedRecord;
      records.push({ slug: f.replace(/\.json$/, ''), record });
    } catch {
      // skip a malformed fixture rather than break the whole page
    }
  }
  records.sort((a, b) => {
    const dt = issuedAtMs(b.record) - issuedAtMs(a.record);
    if (dt !== 0) return dt;
    return PREFERRED_ORDER.indexOf(a.slug) - PREFERRED_ORDER.indexOf(b.slug);
  });
  return records.map((r) => r.record);
}
