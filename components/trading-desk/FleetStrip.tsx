// Horizontal fleet strip (Phase 4) — four agent cards below the metrics. Each
// shows agent type + role + a status dot/badge that flashes "active" on emission
// then settles to the agent's last-decision color.

import {
  TRADING_FLEET,
  lastDecisionByType,
  statusFor,
  type AgentStatus,
} from '@/lib/dashboard/fleet';
import type { FeedEntry } from '@/lib/dashboard/feed';

const DOT_CLASS: Record<AgentStatus, string> = {
  idle: 'neutral',
  active: 'accent pulse',
  permit: 'healthy',
  deny: 'danger',
};

const BADGE: Record<AgentStatus, { cls: string; label: string }> = {
  idle: { cls: 'neutral', label: 'Idle' },
  active: { cls: 'accent', label: 'Active' },
  permit: { cls: 'healthy', label: 'Permit' },
  deny: { cls: 'danger', label: 'Deny' },
};

const ACCENT_BAR: Record<AgentStatus, string> = {
  idle: '2px solid transparent',
  active: '2px solid var(--accent)',
  permit: '2px solid var(--healthy)',
  deny: '2px solid var(--danger)',
};

export function FleetStrip({
  entries,
  flashingType,
}: {
  entries: FeedEntry[];
  flashingType: string | null;
}) {
  const last = lastDecisionByType(entries);
  return (
    <div
      className="card-grid"
      style={{ gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}
    >
      {TRADING_FLEET.map((agent) => {
        const status = statusFor(agent.type, last, flashingType);
        const badge = BADGE[status];
        return (
          <div
            className="bucket-card"
            key={agent.type}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: ACCENT_BAR[status] }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>
                {agent.type}
              </span>
              <span className={`dot ${DOT_CLASS[status]}`} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, minHeight: 30 }}>
              {agent.role}
            </span>
            <span className={`badge ${badge.cls}`}>{badge.label}</span>
          </div>
        );
      })}
    </div>
  );
}
