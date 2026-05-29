'use client';

// Echo OS sidebar (Phase 2 chrome; Bubble 16 made it route-aware). AgentMarshal
// mark + FLEETS / SYSTEM sections + user footer. Trading Desk is the active fleet;
// the other fleets are disabled placeholders ("soon") that imply the broader
// Cortex system. Audit trail / Scope contracts / Verify navigate via <Link> so the
// session-scoped feed store (lib/dashboard/feed-store.ts) survives navigation —
// a full-page <a> reload would reset it.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Geometric, library-free icon marks (Phase 8: no emoji / decorative unicode).
function ToolMark() {
  return (
    <span
      style={{ width: 7, height: 7, border: '1px solid currentColor', display: 'inline-block' }}
    />
  );
}

const SYSTEM_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/audit-trail', label: 'Audit trail' },
  { href: '/receipts', label: 'Receipts' },
  { href: '/scope-contracts', label: 'Scope contracts' },
  { href: '/verify', label: 'Verify' },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div
        className="sidebar-logo"
        role="button"
        tabIndex={0}
        title="Toggle sidebar"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
        style={{ cursor: 'pointer' }}
      >
        <span className="mark">AM</span>
        <span className="logo-text">AGENTMARSHAL</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Fleets</div>
        <Link
          className={isActive('/trading-desk') ? 'sidebar-item active' : 'sidebar-item'}
          href="/trading-desk"
          style={{ textDecoration: 'none' }}
        >
          <span className="si-icon">
            <span className="dot healthy pulse" />
          </span>
          <span className="si-label">Trading Desk</span>
          <span className="si-badge">4</span>
        </Link>
        {['Outreach', 'Voice', 'Operational'].map((name) => (
          <div className="sidebar-item disabled" key={name} aria-disabled="true">
            <span className="si-icon">
              <span className="dot neutral" />
            </span>
            <span className="si-label">{name}</span>
            <span className="si-soon">soon</span>
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">System</div>
        {SYSTEM_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            className={isActive(href) ? 'sidebar-item active' : 'sidebar-item'}
            href={href}
            style={{ textDecoration: 'none' }}
          >
            <span className="si-icon">
              <ToolMark />
            </span>
            <span className="si-label">{label}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-footer">
        <span className="avatar">CR</span>
        <div className="user-meta logo-text">
          <div className="nm">Conner Reinhardt</div>
          <div className="rl">Compliance operator</div>
        </div>
      </div>
    </aside>
  );
}
