'use client';

// Polished receipt detail panel (Bubble 21, Phases 2–5).
//
// Renders a selected signed record: decision header, the prominent LLM adverse-media
// reasoning sentence, color-coded composite checks, governed Bright Data calls (with a
// distinct policy-refused treatment for governance denies), the hash-chain link, a
// one-click Verify, and the tamper-edit surface. The Verify + Re-verify surfaces both
// POST the bytes to /api/verify/receipt — the real verifier on real (sometimes-modified)
// bytes — and share one result banner (VerifierResult). Every model-emitted string
// (reasoning, concerns, reasons) renders via React's default {string} escaping; there is
// no dangerouslySetInnerHTML on any path here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeedEntry, FeedDecision, SignedRecord } from '@/lib/dashboard/feed';
import {
  receiptComposites,
  recordBdCalls,
  previousHash,
  recordHash,
  bdCallTarget,
  type ReceiptComposite,
} from '@/lib/dashboard/receipt-display';
import type { BDCallAudit } from '@/types/authzen';
import { VerifierResult, type VerifyState } from './VerifierResult';

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

const DECISION_BADGE: Record<FeedDecision, { cls: string; label: string }> = {
  permit: { cls: 'healthy', label: 'PERMIT' },
  review: { cls: 'warning', label: 'REVIEW REQUIRED' },
  deny: { cls: 'danger', label: 'DENY' },
};

const VERDICT_BORDER: Record<string, string> = {
  fail: 'var(--danger)',
  review: 'var(--warning)',
  pass: 'var(--healthy)',
};

async function postVerify(receipt: unknown): Promise<VerifyState> {
  try {
    const res = await fetch('/api/verify/receipt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receipt }),
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', error: data.error ?? 'Verification request failed.' };
    return { status: 'done', result: data };
  } catch {
    return { status: 'error', error: 'Could not reach the verification endpoint.' };
  }
}

function Kv({ k, v, title }: { k: string; v: React.ReactNode; title?: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v" style={{ wordBreak: 'break-all' }} title={title}>
        {v}
      </span>
    </div>
  );
}

function CompositeBadge({ result }: { result: string }) {
  if (result === 'fail') return <span className="badge danger">FAIL</span>;
  if (result === 'review') return <span className="badge warning">REVIEW</span>;
  if (result === 'stub') return <span className="badge warning">UNRESOLVED</span>;
  if (result === 'pass') return <span className="badge healthy">PASS</span>;
  return <span className="badge neutral">{result.toUpperCase()}</span>;
}

// ── Adverse-media screening (prominent reasoning + best-effort edge states) ──────────
function AdverseMediaBlock({ composites }: { composites: ReceiptComposite[] }) {
  const am = composites.find((c) => c.predicate === 'entity_adverse_media_check');
  if (!am) return null;
  const d = (am.details ?? {}) as Record<string, unknown>;

  // Phase 5 best-effort states: render distinctly, not as the reasoning sentence.
  if (d.screening_unavailable === true || d.screening_incomplete === true) {
    const incomplete = d.screening_incomplete === true;
    return (
      <div className="rail-section">
        <div className="title">Adverse-media screening</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge warning">{incomplete ? 'INCOMPLETE' : 'UNAVAILABLE'}</span>
          <span
            style={{ fontSize: 11, color: 'var(--text-3)', cursor: 'help' }}
            title={
              incomplete
                ? 'Every source extraction failed; nothing could be scored. Best-effort policy: recorded for audit, non-blocking.'
                : 'The screening provider could not be reached (no credentials, denied, or error). Best-effort policy: recorded for audit, non-blocking.'
            }
          >
            best-effort · non-blocking
          </span>
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', margin: 0 }}>{am.reason}</p>
      </div>
    );
  }

  const reasoning = typeof d.llm_reasoning === 'string' ? d.llm_reasoning : am.reason ?? '';
  const isLlm = d.scoring_path === 'llm' && typeof d.llm_reasoning === 'string';
  const fallback = d.llm_fallback === true || d.scoring_path === 'keyword';
  const concerns = Array.isArray(d.llm_concerns) ? (d.llm_concerns as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  const matched = Array.isArray(d.matched_keywords) ? (d.matched_keywords as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  const model = typeof d.llm_model === 'string' ? d.llm_model : null;
  const border = VERDICT_BORDER[am.result] ?? 'var(--border-strong)';

  return (
    <div className="rail-section">
      <div className="title">Adverse-media screening</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <CompositeBadge result={am.result} />
        {isLlm && model && <span className="badge accent">LLM · {model}</span>}
        {fallback && <span className="badge warning">keyword fallback</span>}
      </div>
      {reasoning && (
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.62,
            color: 'var(--text)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${border}`,
            padding: '12px 14px',
            margin: 0,
          }}
        >
          {/* model-emitted: React default escaping, never dangerouslySetInnerHTML */}
          {reasoning}
        </p>
      )}
      {concerns.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            Concerns
          </span>
          {concerns.map((c, i) => (
            <span key={i} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}
      {fallback && matched.length > 0 && (
        <p style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
          matched keywords: {matched.join(', ')}
        </p>
      )}
    </div>
  );
}

// ── Composite checks (compact, color-coded) ─────────────────────────────────────────
function CompositeChecks({ composites }: { composites: ReceiptComposite[] }) {
  return (
    <div className="rail-section">
      <div className="title">Composite checks</div>
      {composites.length === 0 ? (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>no composite checks</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {composites.map((c, i) => (
            <div key={`${c.predicate}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <CompositeBadge result={c.result} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>{c.predicate}</div>
                {c.reason && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.45, marginTop: 2 }}>{c.reason}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bright Data calls (governance-deny gets a distinct policy-refused treatment) ─────
function BdServiceBadge({ service }: { service: string }) {
  return <span className="badge neutral">{service}</span>;
}

function BdCall({ call }: { call: BDCallAudit }) {
  const denied = call.governance_result === 'deny';
  const target = bdCallTarget(call);
  const failed = call.composite_outcomes.find((o) => o.result === 'fail');
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${denied ? 'var(--danger)' : 'var(--healthy)'}`,
        background: denied ? 'rgba(179,60,60,0.06)' : 'var(--surface)',
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <BdServiceBadge service={call.service} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)' }}>{call.tool}</span>
        <span className={denied ? 'badge danger' : 'badge healthy'} style={{ marginLeft: 'auto' }}>
          {denied ? 'POLICY REFUSED' : 'PERMIT'}
        </span>
      </div>
      {denied && (
        <p style={{ fontSize: 11.5, color: 'var(--danger)', lineHeight: 1.45, margin: '0 0 8px' }}>
          AgentMarshal refused to forward this Bright Data call
          {failed ? `: ${failed.composite} failed` : ''}.
        </p>
      )}
      {target && <Kv k="target" v={target.length > 56 ? `${target.slice(0, 56)}…` : target} title={target} />}
      {call.response_sha256 && <Kv k="sha256" v={`${call.response_sha256.slice(0, 12)}…`} title={call.response_sha256} />}
      {call.duration_ms != null && <Kv k="latency" v={`${call.duration_ms} ms`} />}
      <Kv
        k="checks"
        v={
          call.composite_outcomes.length > 0
            ? call.composite_outcomes.map((o) => `${o.composite}=${o.result}`).join(', ')
            : '(none)'
        }
      />
      {call.matched_rule_id && <Kv k="rule" v={call.matched_rule_id} />}
    </div>
  );
}

function BdCallsBlock({ calls }: { calls: BDCallAudit[] }) {
  return (
    <div className="rail-section">
      <div className="title">Bright Data calls · {calls.length}</div>
      {calls.length === 0 ? (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
          no Bright Data calls in this evaluation
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {calls.map((c, i) => (
            <BdCall key={i} call={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hash chain link ──────────────────────────────────────────────────────────────────
function ChainBlock({
  record,
  hasPrevInView,
  onNavigate,
}: {
  record: SignedRecord;
  hasPrevInView: boolean;
  onNavigate: (hash: string) => void;
}) {
  const prev = previousHash(record);
  const self = recordHash(record);
  return (
    <div className="rail-section">
      <div className="title">Hash chain</div>
      {self && <Kv k="this record" v={`${self.slice(0, 16)}…`} title={self} />}
      {prev ? (
        <div style={{ marginTop: 8 }}>
          {hasPrevInView ? (
            <button type="button" className="btn ghost" onClick={() => onNavigate(prev)}>
              ↑ previous receipt {prev.slice(0, 12)}…
            </button>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }} title={prev}>
              previous {prev.slice(0, 16)}… (not in this view)
            </span>
          )}
        </div>
      ) : (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>chain genesis</span>
      )}
    </div>
  );
}

// ── Tamper-edit (the cold open) ──────────────────────────────────────────────────────
function TamperEdit({ record }: { record: SignedRecord }) {
  const original = useMemo(() => pretty(record), [record]);
  const [text, setText] = useState(original);
  const [state, setState] = useState<VerifyState>({ status: 'idle' });

  useEffect(() => {
    setText(original);
    setState({ status: 'idle' });
  }, [original]);

  const dirty = text !== original;

  const reverify = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setState({ status: 'error', error: 'Edited text is not valid JSON.' });
      return;
    }
    setState({ status: 'loading' });
    setState(await postVerify(parsed));
  }, [text]);

  return (
    <div className="rail-section">
      <div className="title">Tamper-edit · live verification</div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Edit any byte of the signed record below (even one character of the reasoning) and re-verify. The Ed25519
        signature is over the canonical body, so any change flips the verdict to TAMPERED. Whitespace-only edits stay
        VERIFIED (JSON canonicalization ignores them).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="textarea mono"
        aria-label="Editable receipt JSON"
        style={{ minHeight: 220, maxHeight: 360 }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn primary" onClick={() => void reverify()} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Verifying…' : 'Re-verify'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setText(original);
            setState({ status: 'idle' });
          }}
          disabled={!dirty}
        >
          Reset
        </button>
        {dirty && (
          <span style={{ alignSelf: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--warning)', letterSpacing: '0.06em' }}>
            MODIFIED
          </span>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <VerifierResult state={state} />
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────────────
export function ReceiptDetail({
  entry,
  hasPrevInView,
  onNavigate,
}: {
  entry: FeedEntry;
  hasPrevInView: boolean;
  onNavigate: (hash: string) => void;
}) {
  const record = entry.record;
  const [clean, setClean] = useState<VerifyState>({ status: 'idle' });

  useEffect(() => {
    setClean({ status: 'idle' });
  }, [entry.id]);

  const verifyClean = useCallback(async () => {
    if (!record) return;
    setClean({ status: 'loading' });
    setClean(await postVerify(record));
  }, [record]);

  if (!record) {
    return <div className="empty">This entry has no signed record attached.</div>;
  }

  const composites = receiptComposites(record);
  const bdCalls = recordBdCalls(record);
  const badge = DECISION_BADGE[entry.decision];

  return (
    <div>
      <div className="rail-header" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge ${badge.cls}`}>{badge.label}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{entry.agentType}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {entry.actionName}
          </span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
          {entry.entityId ? `${entry.entityId} · ` : ''}
          {entry.issuedAt}
        </div>
      </div>

      <div className="rail-section">
        <div className="title">Verification</div>
        <button type="button" className="btn primary" onClick={() => void verifyClean()} disabled={clean.status === 'loading'}>
          {clean.status === 'loading' ? 'Verifying…' : 'Verify this receipt'}
        </button>
        <div style={{ marginTop: 12 }}>
          <VerifierResult state={clean} />
        </div>
      </div>

      <AdverseMediaBlock composites={composites} />
      <CompositeChecks composites={composites} />
      <BdCallsBlock calls={bdCalls} />
      <ChainBlock record={record} hasPrevInView={hasPrevInView} onNavigate={onNavigate} />
      <TamperEdit record={record} />
    </div>
  );
}
