'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Reusable success modal. Centered check emblem (status-success) over the
 * shadcn/base-ui `Dialog`, themed with Wriven brand tokens. Use to confirm a
 * completed action (plan change, save, send, …). Force-dismisses only via its
 * action button (no X) so the success is acknowledged.
 */
export interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  /** Extra secondary action (e.g. "View invoice") rendered beside the primary. */
  secondaryActionLabel?: string;
  onAction?: () => void;
  onSecondaryAction?: () => void;
}

export function SuccessModal({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = 'Done',
  secondaryActionLabel,
  onAction,
  onSecondaryAction,
}: SuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="font-mono">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex items-center justify-center size-11 rounded-full bg-status-success/10 ring-1 ring-status-success/20">
            <Check className="size-5 text-status-success" strokeWidth={3} />
          </div>
          <DialogHeader className="items-center gap-1">
            <DialogTitle className="font-display text-sm font-bold tracking-tight text-text-primary">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="font-light leading-relaxed text-text-secondary">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
        </div>
        <DialogFooter className="sm:justify-center">
          {secondaryActionLabel && (
            <Button variant="outline" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
          <Button
            variant="default"
            onClick={() => {
              onAction?.();
              onOpenChange(false);
            }}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
