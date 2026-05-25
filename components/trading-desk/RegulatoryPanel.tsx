// Right-rail default mode (Phase 5) — regulatory state. Source-agnostic: renders
// whatever the RegulatoryStateProvider hands it, so the Bright Data live feed is
// a provider swap (server side), not a panel change.

import type { OfacSnapshot } from '@/lib/regulatory/ofac';

const RAIL_TITLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text)',
};

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function RegulatoryPanel({ snapshot }: { snapshot: OfacSnapshot }) {
  const live = snapshot.status === 'live';
  return (
    <div>
      <div className="rail-header">
        <span style={RAIL_TITLE}>Sanctions screening</span>
        {/* Default mode — no close needed. */}
        <span className="x" style={{ cursor: 'default' }}>—</span>
      </div>

      <div className="rail-section">
        <div className="title">Status</div>
        <div style={{ marginBottom: 10 }}>
          <span className={live ? 'badge healthy' : 'badge warning'}>
            {live ? 'Live' : 'Awaiting Bright Data feed'}
          </span>
        </div>
        <Kv k="Source" v={snapshot.source} />
        <Kv k="Last updated" v={snapshot.last_updated} />
        <Kv k="Entry count" v={snapshot.entry_count} />
        <Kv k="Fingerprint" v={`${snapshot.fingerprint.hash.slice(0, 12)}…`} />
      </div>

      <div className="rail-section">
        <div className="title">SDN entries</div>
        {snapshot.list.map((entry) => (
          <div
            key={entry}
            style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', padding: '3px 0' }}
          >
            {entry}
          </div>
        ))}
      </div>

      <div className="rail-section">
        <div className="title">About this snapshot</div>
        <p style={{ fontSize: 11, lineHeight: 1.65, color: 'var(--text-3)', margin: 0 }}>
          Each trading decision records a fingerprint of the SDN snapshot it was screened against —
          a reader can confirm <span style={{ color: 'var(--text-2)' }}>which</span> list a decision
          used without embedding the list in every receipt.
        </p>
      </div>
    </div>
  );
}
