'use client';

// Receipt viewer (Phase 5). Opens on an activity-feed row click. Shows the full
// signed record, an independently-computed signature verdict (/api/verify/receipt),
// the RFC 3161 timestamp verdict, and a "Verify at /verify" handoff.

import { useCallback, useEffect, useState } from 'react';
import { VERIFY_HANDOFF_KEY } from '@/lib/verify/handoff';
import type { FeedEntry } from '@/lib/dashboard/feed';
import type { VerifyResult } from '@/lib/verify/verify-receipt';

type VerifyState =
  | { status: 'idle' | 'loading' }
  | { status: 'done'; result: VerifyResult }
  | { status: 'error'; error: string };

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export function ReceiptViewer({ entry, onClose }: { entry: FeedEntry; onClose: () => void }) {
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Re-verify whenever the selected receipt changes. Client-side, against the
  // public key — the same path an external party would use.
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              {String(entry.record?.record_type ?? 'record').replace(/_/g, ' ')}
            </div>
            <div className="font-mono text-sm text-zinc-100">
              {entry.agentType} · {entry.actionName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4">
          <VerdictRow verify={verify} />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <JsonBlock value={entry.record} />
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
          <span className="text-[11px] text-zinc-500">
            Signature checked client-side against the published Ed25519 key.
          </span>
          <button
            type="button"
            onClick={openInVerify}
            className="bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-white"
          >
            Verify at /verify ↗
          </button>
        </div>
      </div>
    </div>
  );
}

function VerdictRow({ verify }: { verify: VerifyState }) {
  if (verify.status === 'error') {
    return <p className="text-sm text-red-300">Verification error: {verify.error}</p>;
  }
  if (verify.status === 'done') {
    const { verified, timestamp } = verify.result;
    return (
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-6">
        <Verdict ok={verified} okLabel="Signature valid" badLabel="Signature invalid" />
        <TimestampVerdict status={timestamp.status} />
      </div>
    );
  }
  return <p className="text-sm text-zinc-400">Verifying signature…</p>;
}

function Verdict({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm font-medium ${
        ok ? 'text-emerald-300' : 'text-red-300'
      }`}
    >
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      {ok ? okLabel : badLabel}
    </span>
  );
}

function TimestampVerdict({ status }: { status: 'timestamped' | 'unavailable' | 'invalid' }) {
  if (status === 'timestamped') {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-300">
        <span className="text-emerald-400">✓</span> Timestamped (TSA verified)
      </span>
    );
  }
  if (status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-300">
        <span className="text-amber-400">⚠</span> Timestamp unavailable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-red-300">
      <span className="text-red-400">✗</span> Timestamp invalid
    </span>
  );
}

// Restrained JSON highlight — a code inspector, not status color. Keys/keywords
// get cool accents; numbers amber. Green/red stay reserved for permit/deny.
function syntaxHighlight(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-300'; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-sky-300' : 'text-zinc-300'; // key : string
      } else if (/true|false/.test(match)) {
        cls = 'text-violet-300';
      } else if (/null/.test(match)) {
        cls = 'text-zinc-600';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-zinc-500">No record to display.</p>;
  }
  return (
    <pre
      className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-300"
      dangerouslySetInnerHTML={{ __html: syntaxHighlight(pretty(value)) }}
    />
  );
}
