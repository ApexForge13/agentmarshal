// Echo OS sidebar (Phase 2). AgentMarshal mark + FLEETS / SYSTEM sections + user
// footer. Trading Desk is the active fleet; the others are placeholders that
// imply the broader Cortex system. Only "Verify" navigates (to /verify).

// Geometric, library-free icon marks (Phase 8: no emoji / decorative unicode).
function ToolMark() {
  return (
    <span
      style={{ width: 7, height: 7, border: '1px solid currentColor', display: 'inline-block' }}
    />
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
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
        <div className="sidebar-item active">
          <span className="si-icon">
            <span className="dot healthy pulse" />
          </span>
          <span className="si-label">Trading Desk</span>
          <span className="si-badge">4</span>
        </div>
        {['Outreach', 'Voice', 'Operational'].map((name) => (
          <div className="sidebar-item" key={name} style={{ opacity: 0.45, cursor: 'default' }}>
            <span className="si-icon">
              <span className="dot neutral" />
            </span>
            <span className="si-label">{name}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">System</div>
        <div className="sidebar-item" style={{ cursor: 'default' }}>
          <span className="si-icon">
            <ToolMark />
          </span>
          <span className="si-label">Audit trail</span>
        </div>
        <div className="sidebar-item" style={{ cursor: 'default' }}>
          <span className="si-icon">
            <ToolMark />
          </span>
          <span className="si-label">Scope contracts</span>
        </div>
        <a className="sidebar-item" href="/verify" style={{ textDecoration: 'none' }}>
          <span className="si-icon">
            <ToolMark />
          </span>
          <span className="si-label">Verify</span>
        </a>
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
