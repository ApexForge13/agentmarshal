'use client';

// Interactive verify form. Plain React state (no client-side state library) +
// fetch to /api/verify/receipt. Server component (page.tsx) supplies the
// published public key and example receipts as props.

import { useEffect, useState } from 'react';
import type { PublicKeyInfo } from '@/lib/verify/load-public-key';
import type { VerifyResult } from '@/lib/verify/verify-receipt';
import type { TimestampResult } from '@/lib/compliance/timestamp/types';
import { VERIFY_HANDOFF_KEY } from '@/lib/verify/handoff';

interface Examples {
  valid_compliance: unknown;
  valid_internal_audit: unknown;
  tampered_compliance: unknown;
}

interface Props {
  publicKey: PublicKeyInfo;
  examples: Examples;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

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

  const btn =
    'rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50';

  return (
    <div className="flex flex-col gap-6">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a Compliance Receipt or Internal Audit envelope (JSON)…"
        spellCheck={false}
        className="h-64 w-full resize-y rounded-lg border border-border bg-zinc-900 p-4 font-mono text-xs text-zinc-100 outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={verify}
          disabled={busy || text.trim().length === 0}
          className={`${btn} bg-emerald-600 text-white hover:bg-emerald-500`}
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>
        <button
          onClick={() => loadExample('valid_compliance')}
          className={`${btn} bg-zinc-700 text-zinc-100 hover:bg-zinc-600`}
        >
          Load valid example
        </button>
        <button
          onClick={() => loadExample('tampered_compliance')}
          className={`${btn} bg-zinc-700 text-zinc-100 hover:bg-zinc-600`}
        >
          Load tampered example
        </button>
        <button
          onClick={() => loadExample('valid_internal_audit')}
          className={`${btn} bg-zinc-800 text-zinc-300 hover:bg-zinc-700`}
        >
          Load internal-audit example
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && <ResultPanel result={result} />}

      <PublicKeyPanel publicKey={publicKey} copied={copied} onCopy={copy} />
    </div>
  );
}

function ResultPanel({ result }: { result: VerifyResult }) {
  const ok = result.verified;
  return (
    <div
      className={`rounded-lg border p-5 ${
        ok ? 'border-emerald-700 bg-emerald-950/40' : 'border-red-800 bg-red-950/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`text-2xl ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {ok ? '✓' : '✗'}
        </span>
        <div>
          <p className={`font-semibold ${ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {ok ? 'Verified — signature valid' : 'Invalid — verification failed'}
          </p>
          <p className="text-sm text-zinc-400">{result.reason}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Field label="record_type" value={result.record_type} mono />
        {result.details && (
          <>
            <Field label="agent_id" value={result.details.agent_id} mono />
            <Field label="decision" value={result.details.decision} mono />
            <Field label="issued_at" value={result.details.issued_at} mono />
            <Field
              label="previous_receipt_hash"
              value={result.details.previous_receipt_hash ?? 'null (chain genesis)'}
              mono
            />
            <Field
              label="composites_fired"
              value={
                result.details.composites_fired.length > 0
                  ? result.details.composites_fired.join(', ')
                  : '(none)'
              }
              mono
            />
          </>
        )}
      </dl>

      <TimestampBlock ts={result.timestamp} />
    </div>
  );
}

// RFC 3161 external timestamp verdict, reported separately from the signature.
// Developer-facing copy for now; regulator-readable polish lands in a later bubble.
function TimestampBlock({ ts }: { ts: TimestampResult }) {
  if (ts.status === 'timestamped') {
    return (
      <div className="mt-4 rounded-md border border-emerald-700 bg-emerald-950/30 p-4">
        <p className="flex items-center gap-2 font-semibold text-emerald-300">
          <span className="text-emerald-400">✓</span> Timestamp — externally anchored
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          RFC 3161 time anchor by <span className="font-mono">{ts.tsa}</span> at{' '}
          <span className="font-mono">{ts.timestamp_at}</span>. Third-party proof of WHEN this
          receipt existed, independent of AgentMarshal&apos;s clock or records.
        </p>
      </div>
    );
  }
  if (ts.status === 'unavailable') {
    return (
      <div className="mt-4 rounded-md border border-amber-700 bg-amber-950/30 p-4">
        <p className="flex items-center gap-2 font-semibold text-amber-300">
          <span className="text-amber-400">⚠</span> Timestamp — not externally timestamped
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Signature valid but no third-party time anchor (TSA unreachable at issuance, or a
          pre-timestamping receipt).
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-red-800 bg-red-950/30 p-4">
      <p className="flex items-center gap-2 font-semibold text-red-300">
        <span className="text-red-400">✗</span> Timestamp — invalid
      </p>
      <p className="mt-1 text-sm text-zinc-400">{ts.reason}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`break-all text-zinc-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
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
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-zinc-200">
        AgentMarshal published public key (Ed25519)
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        key_id <span className="font-mono">{publicKey.key_id}</span> · fingerprint{' '}
        <span className="font-mono">{publicKey.public_key_fingerprint}</span>
      </p>

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
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
        <button
          onClick={onCopy}
          className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-600"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
        {value}
      </pre>
    </div>
  );
}
