// Echo OS metrics strip (Phase 3). Six tiles; the parent computes the values.
// Color is functional only — a tone is applied to the value when a count crosses
// into warning/danger territory.

export type MetricTone = 'default' | 'warning' | 'danger';

export interface Metric {
  label: string;
  value: string;
  tone?: MetricTone;
}

function toneColor(tone: MetricTone | undefined): string | undefined {
  if (tone === 'warning') return 'var(--warning)';
  if (tone === 'danger') return 'var(--danger)';
  return undefined;
}

export function MetricsStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="metrics">
      {metrics.map((m) => {
        const color = toneColor(m.tone);
        return (
          <div className="metric" key={m.label}>
            <div className="label">{m.label}</div>
            <div className="val" style={color ? { color } : undefined}>
              {m.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
