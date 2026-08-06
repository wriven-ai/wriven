'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DowngradeBlock } from '@/lib/types';

/**
 * Modal shown when a plan downgrade is blocked because the workspace holds more
 * of a stock resource than the target plan allows. Lists each over-limit
 * dimension (used vs allowed) and points the user at where to trim. Driven by
 * the client-side eager preview (lib/downgrade) or the gateway's
 * `DOWNGRADE_BLOCKED` error `details` (race backstop). specs/18.
 */
export interface BlockedDowngradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlanName: string;
  blocks: DowngradeBlock[];
}

export function BlockedDowngradeDialog({
  open,
  onOpenChange,
  targetPlanName,
  blocks,
}: BlockedDowngradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="font-mono">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex items-center justify-center size-11 rounded-full bg-status-error/10 ring-1 ring-status-error/20">
            <AlertTriangle
              className="size-5 text-status-error"
              strokeWidth={2.5}
            />
          </div>
          <DialogHeader className="items-center gap-1">
            <DialogTitle className="font-display text-sm font-bold tracking-tight text-text-primary">
              Can&apos;t downgrade to {targetPlanName} yet
            </DialogTitle>
            <DialogDescription className="font-light leading-relaxed text-text-secondary">
              Remove the resources over {targetPlanName}&apos;s limits, then try
              again.
            </DialogDescription>
          </DialogHeader>
        </div>

        <ul className="divide-y divide-brand-border border border-brand-border rounded-lg overflow-hidden my-1">
          {blocks.map((b) => (
            <li
              key={b.dimension}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
            >
              <span className="text-text-secondary">{b.label}</span>
              <span className="font-bold text-status-error tabular-nums">
                {b.used.toLocaleString()} / {b.limit.toLocaleString()} allowed
              </span>
            </li>
          ))}
        </ul>

        <DialogDescription className="font-light text-xs text-text-muted text-center">
          Delete projects or members, content types, entries, media, API keys,
          or webhooks to get under the limits.
        </DialogDescription>

        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
