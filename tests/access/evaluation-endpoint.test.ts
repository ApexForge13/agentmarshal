// Endpoint emission tests (Bubble 6).
// Confirm /api/access/v1/evaluation produces a signed Compliance Receipt or
// Internal Audit envelope on every evaluation, selects the kind via
// emissionTypeFor(subject.type), and the wire shape exposes a record_type
// discriminator at response.record. Also unit-tests the canonical AuthZEN
// path rewrite in next.config.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/authzen/contracts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authzen/contracts')>(
    '@/lib/authzen/contracts',
  );
  return {
    ...actual,
    loadContractForAgent: vi.fn(actual.loadContractForAgent),
  };
});

import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { POST } from '../../app/api/access/v1/evaluation/route';
import { loadContractForAgent } from '@/lib/authzen/contracts';
import { init as initAudit, reset as resetAudit } from '../../lib/authzen/audit';
import { FileKeyProvider } from '../../lib/compliance/keys/file-provider';
import { canonicalize } from '../../lib/compliance/receipt/canonical';
import { verify as verifyEd25519 } from '../../lib/compliance/receipt/verify';
import nextConfig from '../../next.config';
import type { ScopeContract } from '../../types/authzen';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/access/v1/evaluation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Strip the response-level discriminator + hash + signatures to recover the
// signed body. For Compliance Receipts the record_type was synthetic (not part
// of the signed bytes). For Internal Audit records the record_type is
// intrinsic to the signed body and must be retained.
function bodyForVerification(record: Record<string, unknown>): Record<string, unknown> {
  if ('receipt_hash' in record) {
    const {
      record_type: _rt,
      receipt_hash: _rh,
      signatures: _sigs,
      timestamp_token: _tt, // attached post-signing (Bubble 11); never in signed bytes
      ...body
    } = record;
    return body;
  }
  const { audit_hash: _ah, signatures: _sigs, timestamp_token: _tt, ...body } = record;
  return body;
}

async function verifySignature(record: Record<string, unknown>, publicKey: Buffer): Promise<boolean> {
  const sigs = record.signatures as Array<{ signature: string }>;
  if (!sigs || sigs.length === 0) return false;
  const canonical = canonicalize(bodyForVerification(record));
  return verifyEd25519({
    canonicalBytes: canonical,
    signatureHex: sigs[0].signature,
    publicKeyRaw: publicKey,
    algorithm: 'ed25519',
  });
}

describe('AuthZEN evaluation endpoint — signed-record emission (Bubble 6)', () => {
  let tmpDbPath: string;
  let publicKey: Buffer;
  const mockedLoader = vi.mocked(loadContractForAgent);

  beforeEach(async () => {
    tmpDbPath = path.join(os.tmpdir(), `authzen-bubble6-${randomUUID()}.db`);
    initAudit(tmpDbPath);
    const provider = new FileKeyProvider();
    const handle = await provider.getActiveSigningHandle();
    publicKey = handle.keyMaterial.public_key_raw;
    mockedLoader.mockClear();
  });

  afterEach(() => {
    resetAudit();
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
  });

  it('customer-touching agent type Voice emits a Compliance Receipt with valid signature', async () => {
    const response = await POST(
      makeRequest({
        subject: { type: 'Voice', id: 'voice-agent-vapi-01' },
        action: { name: 'accept_call', properties: { call_id: 'call-001' } },
        resource: { type: 'phone_call', id: 'call-001' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record).toBeDefined();
    expect(body.record.record_type).toBe('compliance_receipt');
    expect(body.record.receipt_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.record.receipt_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.record.signatures).toHaveLength(1);
    expect(body.record.previous_receipt_hash).toBeNull();
    expect(body.record.agent_id).toBe('voice-agent-vapi-01');
    expect(await verifySignature(body.record, publicKey)).toBe(true);
  });

  it('non-customer-touching agent type LeadScraper emits an Internal Audit record with valid signature', async () => {
    const response = await POST(
      makeRequest({
        subject: { type: 'LeadScraper', id: 'leadscraper-001' },
        action: { name: 'scrape_url', properties: { source_url: 'https://example.com' } },
        resource: { type: 'lead_source', id: 'src-1' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record.record_type).toBe('internal_audit');
    expect(body.record.record_id).toMatch(/^ia-[0-9a-f-]{36}$/i);
    expect(body.record.audit_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.record.previous_audit_hash).toBeNull();
    expect(body.record.agent.type).toBe('LeadScraper');
    expect(body.record.agent.id).toBe('leadscraper-001');
    expect(body.record.signatures).toHaveLength(1);
    expect(await verifySignature(body.record, publicKey)).toBe(true);
  });

  it('unknown agent type defaults to internal_audit emission with COO envelope fallback', async () => {
    const response = await POST(
      makeRequest({
        subject: { type: 'unknown-agent-class', id: 'mystery-agent-001' },
        action: { name: 'do_something', properties: { foo: 'bar' } },
        resource: { type: 'thing', id: 'thing-1' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.record.record_type).toBe('internal_audit');
    expect(body.record.agent.type).toBe('COO');
    expect(body.record.agent.id).toBe('mystery-agent-001');
    // The original unrecognised subject.type is preserved in action.inputs so
    // operators can trace which client misconfigured itself.
    expect(body.record.action.inputs._unrecognized_subject_type).toBe('unknown-agent-class');
    expect(body.record.action.inputs.foo).toBe('bar');
    expect(await verifySignature(body.record, publicKey)).toBe(true);
  });

  it('deny outcome still emits a signed record carrying decision.effect = deny', async () => {
    const denyContract: ScopeContract = {
      scope_contract_version: '0.1',
      contract_id: 'deny-test-contract',
      agent_id: 'voice-deny',
      issuer: { type: 'system', id: 'test' },
      issued_at: '2026-05-23T00:00:00Z',
      declared_scope: [],
    };
    mockedLoader.mockResolvedValueOnce(denyContract);

    const response = await POST(
      makeRequest({
        subject: { type: 'Voice', id: 'voice-deny-01' },
        action: { name: 'accept_call' },
        resource: { type: 'phone_call', id: 'call-x' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.decision).toBe(false);
    expect(body.record.record_type).toBe('compliance_receipt');
    expect(body.record.decision.effect).toBe('deny');
    expect(body.record.decision.evaluation_path).toBe('no_match');
    expect(await verifySignature(body.record, publicKey)).toBe(true);
  });

  it('stub composite check produces deny via fail-safe isAllowable and the record captures the stub trace', async () => {
    const stubCompositeContract: ScopeContract = {
      scope_contract_version: '0.1',
      contract_id: 'stub-composite-test',
      agent_id: 'voice-stub-comp',
      issuer: { type: 'system', id: 'test' },
      issued_at: '2026-05-23T00:00:00Z',
      declared_scope: [
        {
          rule_id: 'voice-with-stub-composite',
          match: { subject: { id: { exists: true } } },
          composite_checks: [
            {
              predicate: 'voice_abandonment_rate_compliant',
              input: { voice_agent_id: 'vapi-test' },
            },
          ],
          decision: {
            effect: 'allow',
            reason_code: 'WOULD_ALLOW_IF_COMPOSITE_PASSED',
            reason: 'allow if composite predicate passes',
          },
        },
      ],
    };
    mockedLoader.mockResolvedValueOnce(stubCompositeContract);

    const response = await POST(
      makeRequest({
        subject: { type: 'Voice', id: 'voice-stub-comp-01' },
        action: { name: 'accept_call' },
        resource: { type: 'phone_call', id: 'call-stub' },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.decision).toBe(false);
    expect(body.record.record_type).toBe('compliance_receipt');
    expect(body.record.decision.effect).toBe('deny');
    expect(body.record.composite_evaluations).toHaveLength(1);
    expect(body.record.composite_evaluations[0]).toMatchObject({
      predicate: 'voice_abandonment_rate_compliant',
      result: 'stub',
    });
    expect(await verifySignature(body.record, publicKey)).toBe(true);
  });

  it('canonical AuthZEN path /access/v1/evaluation rewrites to /api/access/v1/evaluation', async () => {
    expect(nextConfig.rewrites).toBeDefined();
    const rewrites = await nextConfig.rewrites!();
    const list = Array.isArray(rewrites)
      ? rewrites
      : [
          ...(rewrites.beforeFiles ?? []),
          ...(rewrites.afterFiles ?? []),
          ...(rewrites.fallback ?? []),
        ];
    expect(list).toContainEqual({
      source: '/access/v1/evaluation',
      destination: '/api/access/v1/evaluation',
    });
  });
});
