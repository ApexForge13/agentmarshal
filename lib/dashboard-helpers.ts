// Derivation helpers for dashboard UI components. Pure functions over
// AuditEntry — no React, no I/O.

import type { Action, AuditEntry } from '@/types';

export const AGENT_CATEGORY: Record<string, string> = {
  voice_scheduling: 'Customer Operations',
  quoting: 'Sales · Roofing',
  comms: 'Customer Communications · Roofing',
  follow_up: 'Customer Engagement',
  claims: 'Insurance Operations',
};

export function agentCategory(agentId: string): string {
  return AGENT_CATEGORY[agentId] ?? 'Unassigned';
}

export function dollar(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function ctx<T>(entry: AuditEntry, key: string): T | undefined {
  return entry.agentmarshalContext?.[key] as T | undefined;
}

function arg<T>(entry: AuditEntry, key: string): T | undefined {
  return entry.attemptedAction?.args?.[key] as T | undefined;
}

// Short human summary shown in the hero status row and activity feed.
export function entrySummary(entry: AuditEntry): string {
  switch (entry.action) {
    case 'DENY':
      return denySummary(entry);
    case 'HUMAN_REVIEW':
      return reviewSummary(entry);
    case 'ALLOW':
    default:
      return allowSummary(entry);
  }
}

function denySummary(entry: AuditEntry): string {
  const tool = ctx<string>(entry, 'tool_call');
  if (tool === 'update_vendor_payment_record') {
    const amount = ctx<number>(entry, 'dollar_impact');
    const acct = arg<string>(entry, 'new_account') ?? 'unknown account';
    const amountStr = amount ? dollar(amount) : 'unverified amount';
    return `Attempted vendor payment redirect · ${amountStr} → ${acct}`;
  }
  const rule = entry.rulesFired[0];
  return rule?.description || 'Blocked action';
}

function reviewSummary(entry: AuditEntry): string {
  const tool = ctx<string>(entry, 'tool_call');
  if (tool === 'send_quote') {
    const amount = ctx<number>(entry, 'quote_amount');
    const margin = ctx<number>(entry, 'quote_margin');
    const amountStr = amount ? dollar(amount) : 'quote';
    const marginStr =
      typeof margin === 'number' ? `${Math.round(margin * 100)}% margin` : '';
    return `Quote ${amountStr} at ${marginStr} (floor 35%) — owner approval required`;
  }
  const rule = entry.rulesFired[0];
  return rule?.description || 'Awaiting operator review';
}

function allowSummary(entry: AuditEntry): string {
  const tool = ctx<string>(entry, 'tool_call');
  if (tool === 'calendar_create_event') {
    const customer = arg<string>(entry, 'customer') ?? 'customer';
    const start = arg<string>(entry, 'start') ?? '';
    return `Scheduled roof inspection · ${customer} · ${start}`;
  }
  return entry.declaredIntent || 'Action allowed';
}

// Short detail line for the activity feed.
export function entryDetail(entry: AuditEntry): string {
  switch (entry.action) {
    case 'DENY': {
      const amount = ctx<number>(entry, 'dollar_impact');
      const tool = ctx<string>(entry, 'tool_call');
      if (tool === 'update_vendor_payment_record' && amount) {
        return `Blocked ${dollar(amount)} payment redirect`;
      }
      return 'Blocked action';
    }
    case 'HUMAN_REVIEW': {
      const amount = ctx<number>(entry, 'quote_amount');
      if (amount) return `Escalated ${dollar(amount)} quote for approval`;
      return 'Escalated for review';
    }
    case 'ALLOW':
    default: {
      const tool = ctx<string>(entry, 'tool_call');
      if (tool === 'calendar_create_event') return 'Booked appointment';
      return entry.declaredIntent;
    }
  }
}

// Rows shown in the Declared / Detected intent panels.
export interface IntentRow {
  label: string;
  value: string;
  violated?: boolean;
}

export function declaredRows(entry: AuditEntry): IntentRow[] {
  const tool = ctx<string>(entry, 'tool_call');
  if (tool === 'update_vendor_payment_record') {
    return [
      { label: 'Vendor', value: 'ABC Building Supply' },
      { label: 'Category', value: 'Vendor invoice processing' },
      { label: 'Action', value: 'Route invoice to AP' },
      { label: 'Channel', value: 'Email · INBOX' },
    ];
  }
  if (tool === 'send_quote') {
    const customer = arg<string>(entry, 'customer') ?? '—';
    const amount = ctx<number>(entry, 'quote_amount');
    return [
      { label: 'Customer', value: customer },
      { label: 'Job', value: (arg<string>(entry, 'job') ?? '—') },
      { label: 'Amount', value: amount ? dollar(amount) : '—' },
      { label: 'Margin floor', value: '35%' },
    ];
  }
  if (tool === 'calendar_create_event') {
    const customer = arg<string>(entry, 'customer') ?? '—';
    const address = arg<string>(entry, 'address') ?? '—';
    const start = arg<string>(entry, 'start') ?? '—';
    return [
      { label: 'Customer', value: customer },
      { label: 'Address', value: address },
      { label: 'Start', value: start },
      { label: 'Type', value: arg<string>(entry, 'type') ?? '—' },
    ];
  }
  return [
    { label: 'Tool', value: tool ?? '—' },
    { label: 'Intent', value: entry.declaredIntent },
  ];
}

export function detectedRows(entry: AuditEntry): IntentRow[] {
  const tool = ctx<string>(entry, 'tool_call');
  if (tool === 'update_vendor_payment_record') {
    const newAcct = arg<string>(entry, 'new_account') ?? 'unknown';
    const senderDomain = ctx<string>(entry, 'sender_domain') ?? 'unknown';
    return [
      { label: 'Target', value: 'Vendor payment record', violated: true },
      { label: 'New account', value: newAcct, violated: true },
      { label: 'Sender domain', value: senderDomain, violated: true },
      { label: 'Verification', value: 'absent (no out-of-band)', violated: true },
    ];
  }
  if (tool === 'send_quote') {
    const margin = ctx<number>(entry, 'quote_margin');
    const amount = ctx<number>(entry, 'quote_amount');
    const marginStr =
      typeof margin === 'number' ? `${Math.round(margin * 100)}%` : '—';
    return [
      { label: 'Customer', value: arg<string>(entry, 'customer') ?? '—' },
      { label: 'Job', value: arg<string>(entry, 'job') ?? '—' },
      { label: 'Amount', value: amount ? dollar(amount) : '—' },
      { label: 'Margin', value: marginStr, violated: true },
    ];
  }
  if (tool === 'calendar_create_event') {
    return declaredRows(entry);
  }
  return [{ label: 'Detected', value: entry.detectedIntent || '—' }];
}

// Constructed narrative sentence for the detected panel.
export function detectedSentence(entry: AuditEntry): string {
  const tool = ctx<string>(entry, 'tool_call');
  if (tool === 'update_vendor_payment_record') {
    return 'Redirect vendor ABC Building Supply payments via injected <system> instruction.';
  }
  if (tool === 'send_quote') {
    const margin = ctx<number>(entry, 'quote_margin');
    const pct = typeof margin === 'number' ? Math.round(margin * 100) : 0;
    return `Send quote ${pct}% below margin floor — requires operator approval.`;
  }
  if (tool === 'calendar_create_event') {
    return entry.declaredIntent;
  }
  return entry.detectedIntent || entry.declaredIntent;
}

// Map an Action to the side-border color used by the hero card.
export function actionBorder(action: Action): string {
  if (action === 'DENY') return 'border-rose-500';
  if (action === 'HUMAN_REVIEW') return 'border-amber-500';
  return 'border-emerald-500';
}

export function actionPillClass(action: Action): string {
  if (action === 'DENY')
    return 'border-rose-700/60 bg-rose-500/10 text-rose-300';
  if (action === 'HUMAN_REVIEW')
    return 'border-amber-700/60 bg-amber-500/10 text-amber-300';
  return 'border-emerald-700/60 bg-emerald-500/10 text-emerald-300';
}

export function actionLabel(action: Action): string {
  if (action === 'DENY') return 'BLOCKED';
  if (action === 'HUMAN_REVIEW') return 'HUMAN REVIEW';
  return 'ALLOWED';
}
