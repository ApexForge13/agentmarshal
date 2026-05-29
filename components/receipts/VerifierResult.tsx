'use client';

// Shared verifier-result banner (Bubble 21; Bubble 26 restraint pass — Lucide icons).
// Used by BOTH the one-click "Verify this receipt" surface and the tamper-edit
// "Re-verify" surface. The green VERIFIED -> red TAMPERED contrast is the demo's punch
// line, so the verdict icon + word are oversized and high-contrast. The verdict + reason
// come straight from /api/verify/receipt (the real verifier on real, sometimes-modified
// bytes) — never re-derived client-side.

import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { VerifyResult } from '@/lib/verify/verify-receipt';

export type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: VerifyResult }
  | { status: 'error'; error: string };

type Tone = 'good' | 'bad' | 'neutral';

const TONES: Record<Tone, { color: string; bg: string; border: string }> = {
  good: { color: 'var(--healthy)', bg: 'rgba(74,159,74,0.10)', border: 'rgba(74,159,74,0.55)' },
  bad: { color: 'var(--danger)', bg: 'rgba(179,60,60,0.10)', border: 'rgba(179,60,60,0.55)' },
  neutral: { color: 'var(--text-2)', bg: 'var(--surface)', border: 'var(--border-strong)' },
};

function timestampLine(r: VerifyResult): string {
  const ts = r.timestamp;
  if (ts.status === 'timestamped') {
    const chain = r.details?.previous_receipt_hash ? 'chain linked' : 'chain genesis';
    return `RFC 3161 time anchor by ${ts.tsa} at ${ts.timestamp_at} · ${chain}`;
  }
  if (ts.status === 'unavailable') return 'Signature valid; no external timestamp anchor on this record.';
  return `Timestamp ${ts.status}: ${ts.reason}`;
}

function Banner({
  tone,
  icon,
  title,
  detail,
  sub,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  detail: string;
  sub?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        border: `1px solid ${t.border}`,
        background: t.bg,
        padding: '16px',
        borderRadius: 6,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <span aria-hidden style={{ color: t.color, display: 'flex', flexShrink: 0, marginTop: 1 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, letterSpacing: '0.1em', color: t.color }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.55, wordBreak: 'break-word' }}>
          {detail}
        </div>
        {sub && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 8, wordBreak: 'break-all' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function VerifierResult({ state }: { state: VerifyState }) {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') {
    return (
      <Banner
        tone="neutral"
        icon={<Loader2 size={30} aria-hidden />}
        title="VERIFYING"
        detail="Re-running the Ed25519 signature check against the published public key."
      />
    );
  }
  if (state.status === 'error') {
    return <Banner tone="bad" icon={<XCircle size={30} aria-hidden />} title="CANNOT VERIFY" detail={state.error} />;
  }
  const r = state.result;
  if (!r.verified) {
    return <Banner tone="bad" icon={<XCircle size={30} aria-hidden />} title="TAMPERED" detail={r.reason} sub={timestampLine(r)} />;
  }
  return <Banner tone="good" icon={<CheckCircle2 size={30} aria-hidden />} title="VERIFIED" detail={r.reason} sub={timestampLine(r)} />;
}
