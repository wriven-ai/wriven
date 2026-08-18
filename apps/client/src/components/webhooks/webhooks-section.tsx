'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus, Trash2, Webhook } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, webhookApi } from '@/lib/api';
import { WEBHOOK_EVENTS } from '@/lib/types';
import type { WebhookEvent } from '@/lib/types';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

const EVENT_LABEL: Record<WebhookEvent, string> = {
  'entry.published': 'Published',
  'entry.unpublished': 'Unpublished',
  'entry.deleted': 'Deleted',
};

export function WebhooksSection() {
  const { projSlug } = useParams<{ projSlug: string }>();
  const qc = useQueryClient();
  const canManage = useCan()(Permission.WEBHOOK_MANAGE);
  const queryKey = ['webhooks', projSlug];

  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; url: string } | null>(null);

  const { data: hooks = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => webhookApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => webhookApi.create({ url: url.trim(), events }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey });
      setNewSecret(res.secret);
      setUrl('');
      setEvents([...WEBHOOK_EVENTS]);
      setError(null);
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Failed to create webhook.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      webhookApi.update(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhookApi.remove(id),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey });
    },
  });

  const toggleEvent = (e: WebhookEvent) =>
    setEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );

  const copySecret = () => {
    if (!newSecret) return;
    navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-xl border border-brand-border bg-brand-surface p-5">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-brand-secondary" />
        <h2 className="font-mono text-sm font-bold text-text-primary">Webhooks</h2>
      </div>
      <p className="font-mono text-sm text-text-muted leading-relaxed">
        POST a signed payload to your URL when entries are published, unpublished, or
        deleted — to trigger a site rebuild. Verify with the{' '}
        <code className="text-text-secondary">X-Wriven-Signature</code> header (HMAC-SHA256
        over <code className="text-text-secondary">timestamp.body</code>).
      </p>

      {/* One-time secret reveal */}
      {newSecret && (
        <div className="rounded-lg border border-brand-accent/40 bg-brand-accent/5 p-3 space-y-2">
          <p className="font-mono text-sm font-bold text-brand-accent">
            Signing secret — shown once. Store it now.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-brand-surface-soft px-2 py-1.5 font-mono text-sm text-text-primary">
              {newSecret}
            </code>
            <button
              onClick={copySecret}
              className="inline-flex items-center gap-1 rounded border border-brand-border px-2 py-1.5 font-mono text-sm font-bold text-text-secondary hover:text-brand-accent"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewSecret(null)}
            className="font-mono text-sm text-text-muted hover:text-text-secondary"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Existing webhooks */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="font-mono text-sm text-text-muted">Loading…</p>
        ) : hooks.length === 0 ? (
          <p className="font-mono text-sm text-text-muted">No webhooks yet.</p>
        ) : (
          hooks.map((h) => (
            <div
              key={h.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-brand-border bg-brand-surface-soft/40 p-3"
            >
              <div className="min-w-0 space-y-1.5">
                <p className="truncate font-mono text-sm font-bold text-text-primary">{h.url}</p>
                <div className="flex flex-wrap gap-1">
                  {h.events.map((e) => (
                    <span
                      key={e}
                      className="rounded border border-brand-border bg-brand-surface px-1.5 py-0.5 font-mono text-sm font-bold text-text-secondary"
                    >
                      {EVENT_LABEL[e]}
                    </span>
                  ))}
                </div>
                <p className="font-mono text-sm text-text-muted">
                  {h.lastFiredAt
                    ? `Last: ${h.lastStatus ?? '—'} · ${new Date(h.lastFiredAt).toLocaleString()}`
                    : 'Never fired'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleMutation.mutate({ id: h.id, active: !h.active })}
                  disabled={toggleMutation.isPending || !canManage}
                  className={`rounded px-2 py-0.5 font-mono text-sm font-bold border ${
                    h.active
                      ? 'text-green-500 bg-green-500/10 border-green-500/30'
                      : 'text-text-muted bg-brand-surface border-brand-border'
                  }`}
                >
                  {h.active ? 'ACTIVE' : 'PAUSED'}
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: h.id, url: h.url })}
                  disabled={!canManage}
                  className="text-text-muted hover:text-status-error transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() && events.length) createMutation.mutate();
        }}
        className="space-y-3 border-t border-brand-border pt-4"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-site.com/api/wriven"
          className="w-full rounded-lg border border-brand-border bg-brand-surface-soft px-3 py-2 font-mono text-sm text-text-primary focus:border-brand-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-3">
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-1.5 font-mono text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={events.includes(e)}
                onChange={() => toggleEvent(e)}
                className="rounded border-brand-border text-brand-accent focus:ring-0 cursor-pointer"
              />
              {EVENT_LABEL[e]}
            </label>
          ))}
        </div>
        {error && <p className="font-mono text-sm text-status-error">{error}</p>}
        <button
          type="submit"
          disabled={!url.trim() || events.length === 0 || createMutation.isPending || !canManage}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2 font-mono text-sm font-bold text-white transition-all hover:bg-brand-accent-hover disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          {createMutation.isPending ? 'Adding…' : 'Add webhook'}
        </button>
      </form>

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        variant="danger"
        title="Delete this webhook?"
        description={
          deleteTarget
            ? `"${deleteTarget.url}" will stop receiving events immediately. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete webhook"
        loading={deleteMutation.isPending}
        lockWhileLoading
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
