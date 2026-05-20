import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { POST } from '../app/api/access/v1/evaluation/route';
import { init as initAudit, reset as resetAudit } from '../lib/authzen/audit';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/access/v1/evaluation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validRequest = {
  subject: { type: 'agent', id: 'agent-001' },
  action: { name: 'send_email' },
  resource: { type: 'lead', id: 'lead-20189' },
  context: { recipient_state: 'GA' },
};

describe('AuthZEN evaluation endpoint (Day 2 scaffold)', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDbPath = path.join(os.tmpdir(), `authzen-test-${randomUUID()}.db`);
    initAudit(tmpDbPath);
  });

  afterEach(() => {
    resetAudit();
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('returns 200 + decision:true on a valid AuthZEN request (stub allow)', async () => {
    const response = await POST(makeRequest(validRequest));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.decision).toBe(true);
    expect(body.context).toMatchObject({
      reason_code: 'STUB_PERMISSIVE_ALLOW',
      evaluation_path: 'declared_scope',
    });
  });

  it('returns 400 on unparseable JSON body', async () => {
    const req = new Request('http://localhost/api/access/v1/evaluation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 when subject.id is missing', async () => {
    const invalid = {
      subject: { type: 'agent' },
      action: { name: 'send_email' },
      resource: { type: 'lead', id: 'lead-1' },
    };
    const response = await POST(makeRequest(invalid));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 400 when action.name is missing', async () => {
    const response = await POST(makeRequest({
      subject: { type: 'agent', id: 'agent-001' },
      action: {},
      resource: { type: 'lead', id: 'lead-1' },
    }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when resource is missing', async () => {
    const response = await POST(makeRequest({
      subject: { type: 'agent', id: 'agent-001' },
      action: { name: 'send_email' },
    }));
    expect(response.status).toBe(400);
  });

  it('accepts request without optional context field', async () => {
    const { context: _, ...withoutContext } = validRequest;
    const response = await POST(makeRequest(withoutContext));
    expect(response.status).toBe(200);
  });

  it('persists an audit record per successful evaluation', async () => {
    await POST(makeRequest(validRequest));
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(tmpDbPath);
    const row = db.prepare('SELECT COUNT(*) as count FROM authzen_audit').get() as { count: number };
    expect(row.count).toBe(1);
    db.close();
  });
});
