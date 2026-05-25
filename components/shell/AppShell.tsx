'use client';

// Echo OS shell (Phase 1). Owns the .shell grid + sidebar collapse state, mounts
// the sidebar and topbar, and renders the page body as children. Generic chrome —
// the dashboard drives it (passes the topbar notification state, fills children).

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({
  notify,
  children,
}: {
  notify?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="main">
        <Topbar notify={notify} />
        {children}
      </div>
    </div>
  );
}
