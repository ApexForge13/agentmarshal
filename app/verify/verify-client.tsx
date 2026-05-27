'use client';

// Interactive verify form. Plain React state (no client-side state library) +
// fetch to /api/verify/receipt. Server component (page.tsx) supplies the
// published public key and example receipts as props.
//
// Bubble 15: Echo OS chrome. Behavior is byte-identical to Bubble 14 — same
// handoff effect, paste/parse, /api/verify/receipt fetch, result + timestamp
// rendering, example loaders, key copy. Only the markup/classes changed.

import { useEffect, useState } from 'react';
import type { PublicKeyInfo } from '@/lib/verify/load-public-key';
import type { VerifyResult } from '@/lib/verify/verify-receipt';
import type { TimestampResult } from '@/lib/compliance/timestamp/types';
import type { BDCallAudit } from '@/types/authzen';
import { VERIFY_HANDOFF_KEY } from '@/lib/verify/handoff';

interface Examples {
  valid_compliance: unknown;
  valid_internal_audit: unknown;
  tampered_compliance: unknown;
  valid_with_bd_call: unknown;
}

interface Props {
  publicKey: PublicKeyInfo;
  examples: Examples;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

const MONO: React.CSSProperties = { fontFamily: 'var(--mono)' };
const SECTION_LABEL: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
};

export function VerifyClient({ publicKey, examples }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Receipt handoff from the trading-desk receipt viewer ("Verify at /verify").
  // The dashboard stashes a receipt under VERIFY_HANDOFF_KEY and opens this page
  // in a new tab; we pre-load it once and clear the key so a refresh starts clean.
  // (result/error are already null on mount, so only `text` needs seeding.)
  useEffect(() => {
    let stashed: string | null = null;
    try {
      stashed = window.localStorage.getItem(VERIFY_HANDOFF_KEY);
      if (stashed) window.localStorage.removeItem(VERIFY_HANDOFF_KEY);
    } catch {
      return; // storage unavailable; nothing to pre-load
    }
    if (!stashed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only handoff; must run post-mount (not lazy init) to avoid an SSR hydration mismatch
    setText(stashed);
  }, []);

  function loadExample(which: keyof Examples) {
    setText(pretty(examples[which]));
    setResult(null);
    setError(null);
  }

  async function verify() {
    setBusy(true);
    setResult(null);
    setError(null);
    let receipt: unknown;
    try {
      receipt = JSON.parse(text);
    } catch {
      setError('Input is not valid JSON.');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/verify/receipt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receipt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Verification request failed.');
      } else {
        setResult(data as VerifyResult);
      }
    } catch {
      setError('Could not reach the verification endpoint.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable; no-op */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a Compliance Receipt or Internal Audit envelope (JSON)…"
        spellCheck={false}
        className="textarea mono"
        style={{ minHeight: 240 }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn primary"
          onClick={verify}
          disabled={busy || text.trim().length === 0}
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>
        <button type="button" className="btn" onClick={() => loadExample('valid_compliance')}>
          Load valid example
        </button>
        <button type="button" className="btn" onClick={() => loadExample('tampered_compliance')}>
          Load tampered example
        </button>
        <button type="button" className="btn ghost" onClick={() => loadExample('valid_internal_audit')}>
          Load internal-audit example
        </button>
        <button type="button" className="btn ghost" onClick={() => loadExample('valid_with_bd_call')}>
          Load bd_call example
        </button>
      </div>

      {error && (
        <div
          style={{
            border: '1px solid rgba(179,60,60,0.4)',
            background: 'rgba(179,60,60,0.08)',
            color: 'var(--danger)',
            padding: '10px 14px',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {result && <ResultPanel result={result} />}

      <PublicKeyPanel publicKey={publicKey} copied={copied} onCopy={copy} />
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v" style={{ wordBreak: 'break-all' }}>
        {v}
      </span>
    </div>
  );
}

function ResultPanel({ result }: { result: VerifyResult }) {
  const ok = result.verified;
  return (
    <div style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="panel-header">
        <span className="panel-title">Verification result</span>
        <span className={ok ? 'badge healthy' : 'badge danger'} style={{ marginLeft: 'auto' }}>
          {ok ? 'Signature valid' : 'Signature invalid'}
        </span>
      </div>
      <div style={{ padding: '14px 18px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {result.reason}
        </p>
        <Kv k="record_type" v={result.record_type} />
        {result.details && (
          <>
            <Kv k="agent_id" v={result.details.agent_id} />
            <Kv k="decision" v={result.details.decision} />
            <Kv k="issued_at" v={result.details.issued_at} />
            <Kv
              k="previous_receipt_hash"
              v={result.details.previous_receipt_hash ?? 'null (chain genesis)'}
            />
            <Kv
              k="composites_fired"
              v={
                result.details.composites_fired.length > 0
                  ? result.details.composites_fired.join(', ')
                  : '(none)'
              }
            />
          </>
        )}
        {result.details?.bd_calls && result.details.bd_calls.length > 0 && (
          <BdCallsBlock calls={result.details.bd_calls} />
        )}
        <TimestampBlock ts={result.timestamp} />
      </div>
    </div>
  );
}

// Bubble 17: governed Bright Data calls captured in the signed body. Read-only —
// like every signed field, tampering with a bd_call flips the signature verdict.
function BdCallsBlock({ calls }: { calls: BDCallAudit[] }) {
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={SECTION_LABEL}>Bright Data calls</span>
        <span className="badge neutral">{calls.length}</span>
      </div>
      {calls.map((c, i) => (
        <div key={i} style={{ marginBottom: i < calls.length - 1 ? 12 : 0 }}>
          <Kv k="service / tool" v={`${c.service} · ${c.tool}`} />
          <Kv
            k="governance"
            v={
              c.matched_rule_id
                ? `${c.governance_result} (rule ${c.matched_rule_id})`
                : c.governance_result
            }
          />
          <Kv
            k="composite_outcomes"
            v={
              c.composite_outcomes.length > 0
                ? c.composite_outcomes.map((o) => `${o.composite}=${o.result}`).join(', ')
                : '(none)'
            }
          />
          {c.response_sha256 && <Kv k="response_sha256" v={c.response_sha256} />}
          {c.bd_request_id && <Kv k="bd_request_id" v={c.bd_request_id} />}
        </div>
      ))}
    </div>
  );
}

// RFC 3161 external timestamp verdict, reported separately from the signature.
function TimestampBlock({ ts }: { ts: TimestampResult }) {
  let badgeCls = 'badge neutral';
  let label = 'Unavailable';
  let detail: React.ReactNode =
    'Signature valid but no third-party time anchor (TSA unreachable at issuance, or a pre-timestamping receipt).';

  if (ts.status === 'timestamped') {
    badgeCls = 'badge healthy';
    label = 'TSA verified';
    detail = (
      <>
        RFC 3161 time anchor by <span style={MONO}>{ts.tsa}</span> at{' '}
        <span style={MONO}>{ts.timestamp_at}</span>. Third-party proof of WHEN this receipt existed,
        independent of AgentMarshal&apos;s clock or records.
      </>
    );
  } else if (ts.status === 'invalid') {
    badgeCls = 'badge danger';
    label = 'Invalid';
    detail = ts.reason;
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={SECTION_LABEL}>Timestamp</span>
        <span className={badgeCls}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{detail}</p>
    </div>
  );
}

function PublicKeyPanel({
  publicKey,
  copied,
  onCopy,
}: {
  publicKey: PublicKeyInfo;
  copied: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  const jwkText = JSON.stringify(publicKey.jwk, null, 2);
  return (
    <div style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="panel-header">
        <span className="panel-title">Published public key (Ed25519)</span>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...MONO, fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all' }}>
          key_id {publicKey.key_id} · fingerprint {publicKey.public_key_fingerprint}
        </div>
        <KeyRow
          label="Raw (hex)"
          value={publicKey.raw_hex}
          copied={copied === 'hex'}
          onCopy={() => onCopy('hex', publicKey.raw_hex)}
        />
        <KeyRow
          label="JWK"
          value={jwkText}
          copied={copied === 'jwk'}
          onCopy={() => onCopy('jwk', jwkText)}
        />
      </div>
    </div>
  );
}

function KeyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={SECTION_LABEL}>{label}</span>
        <button type="button" className="btn sm" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code">{value}</pre>
    </div>
  );
}
