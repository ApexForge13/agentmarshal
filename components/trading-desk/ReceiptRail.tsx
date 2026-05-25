'use client';

// Right-rail receipt detail (Phase 5, row-clicked mode). Replaces Bubble 14's
// modal. Shows the decision, an independently-computed signature + timestamp
// verdict (/api/verify/receipt), the full signed JSON, and the composite trace.
// "Verify at /verify" hands the receipt off via localStorage (Bubble 14 pattern).

import { useCallback, useEffect, useState } from 'react';
import { VERIFY_HANDOFF_KEY } from '@/lib/verify/handoff';
import { extractComposites, type FeedEntry } from '@/lib/dashboard/feed';
import type { VerifyResult } from '@/lib/verify/verify-receipt';

type VerifyState =
  | { status: 'loading' }
  | { status: 'done'; result: VerifyResult }
  | { status: 'error'; error: string };

const RAIL_TITLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text)',
};

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function ReceiptRail({ entry, onClose }: { entry: FeedEntry; onClose: () => void }) {
  const [verify, setVerify] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const record = entry.record;
      if (!record) {
        setVerify({ status: 'error', error: 'No signed record attached to this entry.' });
        return;
      }
      setVerify({ status: 'loading' });
      try {
        const res = await fetch('/api/verify/receipt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ receipt: record }),
        });
        const data = await res.json();
        if (cancelled) return;
        setVerify(
          res.ok
            ? { status: 'done', result: data as VerifyResult }
            : { status: 'error', error: data.error ?? 'Verification request failed.' },
        );
      } catch {
        if (!cancelled) setVerify({ status: 'error', error: 'Could not reach the verifier.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.record]);

  const openInVerify = useCallback(() => {
    if (!entry.record) return;
    try {
      window.localStorage.setItem(VERIFY_HANDOFF_KEY, pretty(entry.record));
    } catch {
      /* storage unavailable; /verify still opens with an empty box */
    }
    window.open('/verify', '_blank', 'noopener');
  }, [entry.record]);

  const permit = entry.decision === 'permit';
  const composites = extractComposites(entry.record);

  return (
    <div>
      <div className="rail-header">
        <span style={RAIL_TITLE}>Receipt detail</span>
        <span
          className="x"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onClose();
          }}
          role="button"
          tabIndex={0}
          aria-label="Close"
          title="Close"
        >
          ×
        </span>
      </div>

      <div className="rail-section">
        <div className="title">Decision</div>
        <Kv
          k="Decision"
          v={<span className={`badge ${permit ? 'healthy' : 'danger'}`}>{permit ? 'PERMIT' : 'DENY'}</span>}
        />
        <Kv k="Agent" v={entry.agentType} />
        <Kv k="Action" v={entry.actionName} />
        <Kv k="Entity" v={entry.entityId ?? '—'} />
        <Kv k="Decided at" v={entry.issuedAt} />
      </div>

      <div className="rail-section">
        <div className="title">Verification</div>
        <Kv k="Signature" v={<SignatureBadge verify={verify} />} />
        <Kv k="Timestamp" v={<TimestampBadge verify={verify} />} />
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={openInVerify}>
            Verify at /verify
          </button>
        </div>
      </div>

      <div className="rail-section">
        <div className="title">Receipt JSON</div>
        <pre
          className="code"
          dangerouslySetInnerHTML={{ __html: highlightJson(pretty(entry.record)) }}
        />
      </div>

      <div className="rail-section">
        <div className="title">Composite checks</div>
        {composites.length === 0 ? (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
            no composite checks
          </span>
        ) : (
          composites.map((c, i) => (
            <Kv key={`${c.predicate}-${i}`} k={c.predicate} v={<CompositeBadge result={c.result} details={c.details} />} />
          ))
        )}
      </div>
    </div>
  );
}

function SignatureBadge({ verify }: { verify: VerifyState }) {
  if (verify.status === 'loading') return <span className="badge neutral">Verifying…</span>;
  if (verify.status === 'error') return <span className="badge danger">Error</span>;
  return verify.result.verified ? (
    <span className="badge healthy">Valid</span>
  ) : (
    <span className="badge danger">Invalid</span>
  );
}

function TimestampBadge({ verify }: { verify: VerifyState }) {
  if (verify.status !== 'done') return <span className="badge neutral">—</span>;
  const s = verify.result.timestamp.status;
  if (s === 'timestamped') return <span className="badge healthy">TSA verified</span>;
  if (s === 'unavailable') return <span className="badge neutral">Unavailable</span>;
  return <span className="badge danger">Invalid</span>;
}

function CompositeBadge({ result, details }: { result: string; details?: Record<string, unknown> }) {
  if (result === 'fail') {
    const matched = details?.['matched_entry'];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="badge danger">FAIL</span>
        {typeof matched === 'string' && (
          <span style={{ color: 'var(--text-3)' }}>matched {matched}</span>
        )}
      </span>
    );
  }
  if (result === 'stub') return <span className="badge warning">UNRESOLVED</span>;
  return <span className="badge healthy">PASS</span>;
}

// JSON syntax highlight → Echo OS .code spans (.k key, .s string, .n number,
// .b bool/null). Escape first; receipts are our own output, safe post-escape.
function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'n'; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'k' : 's'; // key : string
      } else if (/true|false|null/.test(match)) {
        cls = 'b';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}
