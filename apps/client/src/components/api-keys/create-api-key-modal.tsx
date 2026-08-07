'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { ApiRequestError, apiKeyApi } from '@/lib/api';
import type { ApiKeyScope } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const SCOPES: { value: ApiKeyScope; label: string; desc: string }[] = [
  {
    value: 'read',
    label: 'Read-only content cache',
    desc: 'Fetches published content from the delivery API. Safe to expose client-side.',
  },
  {
    value: 'preview',
    label: 'Read-only draft preview',
    desc: 'Reads drafts + published. Best for preview/staging environments.',
  },
  {
    value: 'manage',
    label: 'Full read/write access',
    desc: 'Full privileges. Keep server-side only — never expose client-side.',
  },
];

export interface CreateApiKeyModalProps {
  projSlug: string;
  canManage: boolean;
  onKeyCreated: (token: string) => void;
  trigger?: React.ReactElement;
}

export function CreateApiKeyModal({
  projSlug,
  canManage,
  onKeyCreated,
  trigger,
}: CreateApiKeyModalProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<ApiKeyScope>('read');
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const queryKey = ['api-keys', projSlug];

  const createMutation = useMutation({
    mutationFn: () => apiKeyApi.create({ name: newName.trim(), scope: newScope }),
    onSuccess: (result) => {
      onKeyCreated(result.token);
      setNewName('');
      setNewScope('read');
      setError(null);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Create failed.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && canManage) {
      createMutation.mutate();
    }
  };

  const defaultTrigger = (
    <Button
      variant="default"
      disabled={!canManage}
      className="bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs h-9.5 px-4 cursor-pointer"
    >
      <Plus className="w-3.5 h-3.5 mr-1.5" />
      Add Key
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (createMutation.isPending) return;
        setOpen(o);
        if (!o) {
          setError(null);
        }
      }}
    >
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="font-mono sm:max-w-lg p-6 bg-brand-surface border border-brand-border text-left">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold tracking-tight text-text-primary">
            Create API Access Token
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-text-muted mt-1 leading-relaxed">
            Generate an access token to authenticate Content Delivery API requests from your client or server applications.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label
              htmlFor="api-key-name"
              className="block text-xs font-mono text-text-secondary mb-1.5 font-semibold"
            >
              Token application context
            </label>
            <input
              id="api-key-name"
              type="text"
              placeholder="e.g. Production site"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-accent h-9"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-secondary mb-1.5 font-semibold">
              Authorization scope
            </label>
            <div className="space-y-1.5">
              {SCOPES.map((s) => (
                <label
                  key={s.value}
                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-brand-border bg-brand-surface-soft/40 cursor-pointer select-none hover:bg-brand-surface-soft transition-colors"
                >
                  <input
                    type="radio"
                    name="modal-scope-group"
                    checked={newScope === s.value}
                    onChange={() => setNewScope(s.value)}
                    className="mt-0.5 text-brand-accent border-brand-border cursor-pointer focus:ring-0"
                  />
                  <div>
                    <p className="text-xs font-mono font-bold text-text-primary">
                      {s.label}
                    </p>
                    <p className="text-xs text-text-muted font-light mt-0.5 leading-snug">
                      {s.desc}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-brand-surface-soft/60 border border-brand-border p-3 rounded-lg text-left space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-amber-500 font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              Secure key guidelines
            </div>
            <p className="text-xs text-text-secondary leading-relaxed font-light">
              Store management keys in server environment configs (
              <code className="font-mono bg-brand-surface border border-brand-border px-1 rounded text-xs">
                process.env.WRIVEN_TOKEN
              </code>
              ). Never commit them or expose admin keys client-side.
            </p>
          </div>

          {error ? (
            <p className="font-mono text-xs text-status-error">{error}</p>
          ) : null}

          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" type="button" disabled={createMutation.isPending} className="h-9.5 px-4 font-mono font-semibold text-xs cursor-pointer" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={createMutation.isPending || !newName.trim() || !canManage}
              className="bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs h-9.5 px-4 cursor-pointer"
            >
              {createMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Creating key…
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create key
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
