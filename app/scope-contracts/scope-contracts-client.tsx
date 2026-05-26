'use client';

// /scope-contracts client (Bubble 16). Lists the seed Scope Contracts as cards —
// trading_v1 is live; Outreach / Voice / Operational are placeholders ("Coming
// soon", matching the disabled sidebar fleets). Clicking the live card opens its
// full JSON in the rail with Echo OS syntax highlighting; the default rail
// explains what a Scope Contract is (judge-facing copy).

import { useState } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { highlightJson } from '@/lib/dashboard/highlight-json';
import tradingV1 from '@/data/contracts/trading_v1.json';

interface ContractCard {
  id: string;
  version: string;
  agents: string[];
  composites: string[];
  status: 'active' | 'soon';
}

// trading_v1 is the live seed contract; the rest mirror the disabled sidebar
// fleets. Values for the live card are read from the committed contract so the
// card and the rail JSON can never drift.
const TRADING_ACTIONS = tradingV1.declared_scope[0]?.match?.action?.name?.in ?? [];
const TRADING_COMPOSITES = (tradingV1.declared_scope[0]?.composite_checks ?? []).map(
  (c) => c.predicate,
);

const CARDS: ContractCard[] = [
  {
    id: tradingV1.contract_id,
    version: tradingV1.scope_contract_version,
    agents: ['TradingAgent', 'ResearchAgent', 'RiskAgent', 'ExecutionAgent'],
    composites: TRADING_COMPOSITES,
    status: 'active',
  },
  { id: 'outreach_v1', version: '0.1', agents: ['CampaignManager', 'ResponseHandler'], composites: ['canspam_*', 'tcpa_*'], status: 'soon' },
  { id: 'voice_v1', version: '0.1', agents: ['Voice'], composites: ['voice_*'], status: 'soon' },
  { id: 'operational_v1', version: '0.1', agents: ['COO', 'InboxAllocator', 'Personalizer'], composites: ['operational_*'], status: 'soon' },
];

const RAIL_TITLE: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text)',
};

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
};

function ContractCardView({
  card,
  selected,
  onSelect,
}: {
  card: ContractCard;
  selected: boolean;
  onSelect: (() => void) | null;
}) {
  const active = card.status === 'active';
  return (
    <div
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect ?? undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect();
            }
          : undefined
      }
      style={{
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        background: selected ? 'rgba(204,85,0,0.06)' : 'var(--surface)',
        padding: '14px 16px',
        cursor: onSelect ? 'pointer' : 'default',
        opacity: active ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text)' }}>{card.id}</span>
        <span className={active ? 'badge accent' : 'badge neutral'}>
          {active ? 'Active' : 'Coming soon'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={LABEL}>Version</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
            {card.version}
          </div>
        </div>
        <div>
          <div style={LABEL}>Agent types</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
            {card.agents.join(', ')}
          </div>
        </div>
        <div>
          <div style={LABEL}>Composite checks</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
            {card.composites.join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutPanel() {
  return (
    <div>
      <div className="rail-header">
        <span style={RAIL_TITLE}>Scope contract</span>
        <span className="x" style={{ cursor: 'default' }}>—</span>
      </div>
      <div className="rail-section">
        <div className="title">What is this?</div>
        <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)', margin: 0 }}>
          A Scope Contract is the signed, versioned declaration of exactly what an agent fleet is
          allowed to do — which actions are in scope, and which composite policy checks must pass
          before any action proceeds. AgentMarshal evaluates every request against the contract and
          emits a signed receipt of the decision. Select a contract to read its full source.
        </p>
      </div>
    </div>
  );
}

export function ScopeContractsClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCard = CARDS.find((c) => c.id === selectedId && c.status === 'active') ?? null;
  const json = selectedCard ? JSON.stringify(tradingV1, null, 2) : '';

  return (
    <AppShell>
      <div className="page">
        <div
          className="page-main"
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div className="page-header">
            <div>
              <h1 className="page-title">Scope Contracts</h1>
              <div className="page-sub">Signed scope declarations · {CARDS.length} contracts</div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
              {CARDS.map((card) => (
                <ContractCardView
                  key={card.id}
                  card={card}
                  selected={card.id === selectedId}
                  onSelect={card.status === 'active' ? () => setSelectedId(card.id) : null}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="page-rail">
          {selectedCard ? (
            <div>
              <div className="rail-header">
                <span style={RAIL_TITLE}>{selectedCard.id}</span>
                <span
                  className="x"
                  role="button"
                  tabIndex={0}
                  aria-label="Close"
                  title="Close"
                  onClick={() => setSelectedId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedId(null);
                  }}
                >
                  ×
                </span>
              </div>
              <div className="rail-section">
                <div className="title">Contract source</div>
                <pre className="code" dangerouslySetInnerHTML={{ __html: highlightJson(json) }} />
              </div>
            </div>
          ) : (
            <AboutPanel />
          )}
        </div>
      </div>
    </AppShell>
  );
}
