// HUMAN_REVIEW approval modal. Visual only — onApprove/onDecline just close.

'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AuditEntry } from '@/types';
import { dollar } from '@/lib/dashboard-helpers';

export interface EscalationModalProps {
  entry: AuditEntry | null;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export function EscalationModal({
  entry,
  onApprove,
  onDecline,
  onClose,
}: EscalationModalProps) {
  const open = entry !== null && entry.action === 'HUMAN_REVIEW';
  const rule = entry?.rulesFired[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-[480px] sm:max-w-[480px] gap-3 border border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogTitle className="text-[18px] font-semibold leading-snug">
          Escalation required — {rule?.description ?? 'operator review'}
        </DialogTitle>
        <p className="text-sm text-zinc-300 leading-relaxed">
          {entry ? bodyFor(entry) : ''}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onDecline}>
            Decline (block)
          </Button>
          <Button variant="default" onClick={onApprove}>
            Approve and send
          </Button>
        </div>
        <div className="mt-3 border-t border-zinc-800 pt-2 font-mono text-[11px] text-zinc-500">
          Escalated to: mike-cortez · {entry?.timestamp ?? ''}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function bodyFor(entry: AuditEntry): string {
  const ctx = entry.agentmarshalContext ?? {};
  const tool = ctx.tool_call as string | undefined;
  if (tool === 'send_quote') {
    const amount = ctx.quote_amount as number | undefined;
    const margin = ctx.quote_margin as number | undefined;
    const marginPct =
      typeof margin === 'number' ? `${Math.round(margin * 100)}%` : '—';
    const amountStr = amount ? dollar(amount) : '—';
    return `Quoting Agent attempted to send a ${amountStr} quote at ${marginPct} gross margin. Margin floor is 35%. Approve to allow, decline to block.`;
  }
  return `${entry.agentId} attempted an action that exceeds policy bounds. Approve to allow, decline to block.`;
}
