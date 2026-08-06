'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Reusable confirmation dialog. Built on the shadcn/base-ui `Dialog` primitive,
 * themed with Wriven brand tokens (mono typeface, brand-accent / status-error
 * accents). Use across the app for "are you sure?" gates before destructive or
 * billing-impacting actions.
 */
export type ConfirmVariant = 'accent' | 'danger' | 'neutral';

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Shows a spinner on the confirm button + disables it (during the mutation). */
  loading?: boolean;
  /** Blocks dismissal (hides X, ignores overlay/escape) while `loading`. */
  lockWhileLoading?: boolean;
  onConfirm: () => void;
}

const BUTTON_VARIANT: Record<ConfirmVariant, 'default' | 'destructive' | 'outline'> = {
  accent: 'default',
  danger: 'destructive',
  neutral: 'outline',
};

const ICON_CLASS: Record<ConfirmVariant, string> = {
  accent: 'text-brand-accent',
  danger: 'text-status-error',
  neutral: 'text-brand-secondary',
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'accent',
  loading = false,
  lockWhileLoading = false,
  onConfirm,
}: ConfirmationDialogProps) {
  const locked = loading && lockWhileLoading;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (locked) return;
        onOpenChange(o);
      }}
    >
      <DialogContent showCloseButton={!locked} className="font-mono sm:max-w-md p-6">
        <DialogHeader>
          <div className="flex items-start gap-2.5">
            <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', ICON_CLASS[variant])} />
            <div className="space-y-1">
              <DialogTitle className="font-display text-base font-bold tracking-tight text-text-primary">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="font-normal leading-relaxed text-text-secondary">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
         <DialogFooter className="mt-2">
           <DialogClose render={<Button variant="ghost" disabled={loading} />}>
             {cancelLabel}
           </DialogClose>
           <Button
             variant={BUTTON_VARIANT[variant]}
             onClick={onConfirm}
             disabled={loading}
           >
             {loading && <Loader2 className="size-3.5 animate-spin" />}
             {confirmLabel}
           </Button>
         </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
