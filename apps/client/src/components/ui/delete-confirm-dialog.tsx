'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
 * Type-to-confirm gate for irreversible deletes: confirm enables only when the
 * typed text matches `matchText` (GitHub/Vercel pattern). Always danger-styled;
 * adds the matching input on top of `ConfirmationDialog`.
 */
export interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Exact text the user must type to enable confirm (e.g. the entity name). */
  matchText: string;
  /** Hint shown above the input. Defaults to a `matchText`-derived prompt. */
  inputHint?: ReactNode;
  /** Shows a spinner on the confirm button + disables it (during the mutation). */
  loading?: boolean;
  /** Blocks dismissal (hides X, ignores overlay/escape) while `loading`. */
  lockWhileLoading?: boolean;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  matchText,
  inputHint,
  loading = false,
  lockWhileLoading = false,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [value, setValue] = useState('');
  // Reset the input whenever the dialog closes so a reopen starts clean.
  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const locked = loading && lockWhileLoading;
  const matches = value === matchText; // exact, case-sensitive — safest

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
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-error" />
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

        <div className="space-y-1.5">
          <p className="text-xs text-text-muted">
            {inputHint ?? (
              <>
                Type{' '}
                <span className="font-bold text-text-primary">{matchText}</span>{' '}
                to confirm.
              </>
            )}
          </p>
          <Input
            value={value}
            onChange={(e) => setValue((e.target as HTMLInputElement).value)}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={matchText}
            disabled={loading}
            className={cn(
              'h-9 rounded-md border border-input bg-input/20 px-2.5 py-1 text-sm',
              'aria-invalid:border-destructive',
            )}
          />
        </div>

        <DialogFooter className="mt-2">
          <DialogClose render={<Button variant="ghost" disabled={loading} />}>
            {cancelLabel}
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!matches || loading}
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
