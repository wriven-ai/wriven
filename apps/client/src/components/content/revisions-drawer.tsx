'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { contentApi } from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

/**
 * Version history for an entry — list past revisions, restore one. Restoring
 * sets the entry's data back to that snapshot and records a new revision (never
 * destructive).
 */
export function RevisionsDrawer({
  entryId,
  open,
  onOpenChange,
}: {
  entryId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);

  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ['revisions', entryId],
    queryFn: () => contentApi.listRevisions(entryId),
    enabled: open,
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => contentApi.restoreRevision(entryId, version),
    onSuccess: () => {
      setRestoreVersion(null);
      qc.invalidateQueries({ queryKey: ['entry', entryId] });
      qc.invalidateQueries({ queryKey: ['revisions', entryId] });
      qc.invalidateQueries({ queryKey: ['entries'] });
      onOpenChange(false);
    },
  });

  // Highest version = current state — not restorable to itself.
  const currentVersion = revisions[0]?.version;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-brand-surface border-brand-border w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-text-primary flex items-center gap-2">
            <History className="h-4 w-4 text-brand-secondary" />
            Version history
          </SheetTitle>
          <SheetDescription className="font-mono text-sm text-text-muted">
            Restore a past version. Restoring records a new revision — nothing is lost.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-2">
          {isLoading ? (
            <p className="font-mono text-sm text-text-muted">Loading…</p>
          ) : revisions.length === 0 ? (
            <p className="font-mono text-sm text-text-muted">No revisions yet.</p>
          ) : (
            revisions.map((rev) => {
              const isCurrent = rev.version === currentVersion;
              return (
                <div
                  key={rev.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    isCurrent
                      ? 'border-brand-accent/40 bg-brand-accent/5'
                      : 'border-brand-border bg-brand-surface-soft/40'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-text-primary">
                      v{rev.version}
                      {isCurrent && (
                        <span className="ml-2 text-sm font-bold text-brand-accent">CURRENT</span>
                      )}
                    </p>
                    <p className="font-mono text-sm text-text-muted">
                      {rev.status} · {new Date(rev.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => setRestoreVersion(rev.version)}
                      disabled={restoreMutation.isPending}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-brand-border px-2 py-1 font-mono text-sm font-bold text-text-secondary hover:text-brand-accent hover:border-brand-accent/40 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>

    <ConfirmationDialog
      open={restoreVersion !== null}
      onOpenChange={(o) => { if (!o) setRestoreVersion(null); }}
      title={restoreVersion !== null ? `Restore version ${restoreVersion}?` : ''}
      description="The current content will be kept as a new revision — nothing is lost."
      confirmLabel="Restore"
      loading={restoreMutation.isPending}
      lockWhileLoading
      onConfirm={() => {
        if (restoreVersion === null) return;
        restoreMutation.mutate(restoreVersion);
      }}
    />
    </>
  );
}
