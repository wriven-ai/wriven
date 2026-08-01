'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CreateEntityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  submitLabel?: string;
  pending?: boolean;
  error?: string | null;
  /** Called with the trimmed name on submit. */
  onSubmit: (name: string) => void;
};

/**
 * Small reusable "create by name" dialog. The workspace and project switchers
 * both use it so creation is an inline dialog, not a page redirect.
 */
export function CreateEntityDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  submitLabel = 'Create',
  pending = false,
  error,
  onSubmit,
}: CreateEntityDialogProps) {
  const [name, setName] = useState('');

  // Reset the field whenever the dialog reopens.
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-brand-border bg-brand-surface text-text-primary ring-0">

        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
              {label}
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              className="border-brand-border bg-brand-surface-soft font-mono text-xs text-text-primary"
            />
            {error ? (
              <p className="text-[10px] font-mono text-status-error">{error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !name.trim()}>
              {pending ? 'Creating…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
