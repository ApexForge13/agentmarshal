// Echo OS topbar (Phase 2). Breadcrumb + (non-functional) global search +
// notification / settings actions. The notification dot lights when the session
// has produced a deny.

export function Topbar({ notify }: { notify?: boolean }) {
  return (
    <div className="topbar">
      <div className="breadcrumb">
        <span>AgentMarshal</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-cur">Trading Desk</span>
      </div>

      <div className="global-search" role="search" aria-label="Search">
        <span>Search receipts, agents, entities…</span>
        <span className="kbd">⌘K</span>
      </div>

      <div className="topbar-right">
        <button type="button" className="icon-btn" title="Notifications" aria-label="Notifications">
          <span style={{ width: 9, height: 9, border: '1px solid currentColor', display: 'inline-block' }} />
          {notify && <span className="dot" />}
        </button>
        <button type="button" className="icon-btn" title="Settings" aria-label="Settings">
          <span
            style={{ width: 9, height: 9, border: '1px solid currentColor', borderRadius: '50%', display: 'inline-block' }}
          />
        </button>
      </div>
    </div>
  );
}
