'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Folder,
  Key,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { ApiRequestError, apiKeyApi } from '@/lib/api';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';
import type { ApiKeyScope } from '@/lib/types';
import { ApiKeyRowsSkeleton } from '@/components/skeleton/api-keys-skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Pagination } from '@/components/ui/pagination';
import { CreateApiKeyModal } from '@/components/api-keys/create-api-key-modal';
import { toast } from 'sonner';

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

const scopeLabel = (s: ApiKeyScope) =>
  SCOPES.find((x) => x.value === s)?.label ?? s;

export default function ApiKeysPage() {
  const { projSlug } = useParams<{ projSlug: string }>();
  const queryClient = useQueryClient();
  const queryKey = ['api-keys', projSlug];

  // The URL carries the project *slug*; resolve the real project id (the value
  // consumers put in the Delivery API path).
  const { projects } = useWorkspaceProjects();
  const canManage = useCan()(Permission.API_KEY_MANAGE);
  const projectId = projects.find((p) => p.slug === projSlug)?.id ?? '';

  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const copyProjectId = () => {
    if (!projectId) return;
    navigator.clipboard.writeText(projectId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const { data: keys, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiKeyApi.list(),
  });

  const allKeys = keys ?? [];
  const totalPages = Math.max(1, Math.ceil(allKeys.length / PAGE_SIZE));
  const paginatedKeys = allKeys.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeyApi.revoke(id),
    onSuccess: () => {
      setRevokeTarget(null);
      setPage(1);
      queryClient.invalidateQueries({ queryKey });
      toast.success('API key revoked successfully.');
    },
    onError: (err) =>
      toast.error(err instanceof ApiRequestError ? err.message : 'Revoke failed.'),
  });

  const copyToken = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!canManage) return <NoAccess />;

  return (
    <>
      <div className="space-y-8 text-left">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-brand-border pb-5">
          <div>
            <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
              Security &{' '}
              <span className="font-normal italic text-brand-secondary">
                API Access Tokens
              </span>
            </h1>
            <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
              {'// Keys that authenticate the Content Delivery API from your site'}
            </p>
          </div>
          <div className="shrink-0">
            <CreateApiKeyModal
              projSlug={projSlug}
              canManage={canManage}
              onKeyCreated={(token) => { setNewToken(token); setPage(1); }}
            />
          </div>
        </div>

        {/* Project ID — needed in every Delivery API URL */}
        <div className="rounded-xl border border-brand-border bg-brand-surface p-3.5 sm:p-4 space-y-1.5">
          <div className="flex items-center gap-2">
            <Folder className="h-3.5 w-3.5 text-brand-secondary" />
            <span className="font-mono text-sm font-bold text-text-secondary">Project ID</span>
          </div>
          <p className="font-mono text-sm text-text-muted leading-relaxed">
            Use this in the Delivery API path:{' '}
            <code className="text-text-secondary">/v1/projects/&lt;projectId&gt;/content/…</code>
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-brand-border bg-brand-surface-soft px-3 py-2 font-mono text-sm text-text-primary">
              {projectId || 'Loading…'}
            </code>
            <button
              onClick={copyProjectId}
              disabled={!projectId}
              className="shrink-0 rounded-lg border border-brand-border p-2 text-text-muted hover:text-brand-accent transition-colors disabled:opacity-50"
              aria-label="Copy project ID"
            >
              {copiedId ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* One-time token reveal */}
        {newToken ? (
          <div className="space-y-3 rounded-xl border border-brand-accent/40 bg-brand-accent/5 p-5">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-text-primary">
              <TriangleAlert className="h-3.5 w-3.5 text-brand-accent" />
              Copy your token now
            </h2>
            <p className="font-mono text-sm text-text-muted leading-relaxed">
              This is the only time the full token is shown. We store only a hash —
              it cannot be retrieved again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-brand-border bg-brand-surface px-3 py-2 font-mono text-sm text-brand-secondary font-bold">
                {newToken}
              </code>
              <button
                onClick={copyToken}
                className="shrink-0 rounded-lg border border-brand-border p-2 text-text-muted hover:text-brand-accent cursor-pointer"
                aria-label="Copy token"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <button
              onClick={() => setNewToken(null)}
              className="font-mono text-sm font-bold text-brand-accent hover:underline cursor-pointer"
            >
              I&apos;ve saved it — dismiss
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main section: list */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-mono tracking-wider text-text-secondary font-bold">
                Active integration tokens ({allKeys.length})
              </span>
            </div>

            {isLoading ? (
              <ApiKeyRowsSkeleton />
            ) : allKeys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface/50 p-8 text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface-soft border border-brand-border">
                  <Key className="h-6 w-6 text-brand-secondary" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-base font-bold text-text-primary">No API keys created yet</h3>
                  <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
                    Create your first API key to connect your site or application to Wriven&apos;s Content Delivery API.
                  </p>
                </div>
                <div className="pt-2">
                  <CreateApiKeyModal
                    projSlug={projSlug}
                    canManage={canManage}
                    onKeyCreated={(token) => { setNewToken(token); setPage(1); }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {paginatedKeys.map((key) => (
                  <div
                    key={key.id}
                    className="bg-brand-surface border border-brand-border hover:border-brand-accent/30 rounded-xl p-3.5 px-4 text-left shadow-xs transition-all"
                  >
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 leading-none">
                          <Key className="w-3.5 h-3.5 text-brand-secondary" />
                          <h3 className="font-display font-bold text-sm tracking-tight truncate text-text-primary">
                            {key.name}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs font-mono text-text-muted leading-none mt-1">
                          <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1 py-0.5 rounded font-bold text-xs">
                            {scopeLabel(key.scope)}
                          </span>
                          <span>•</span>
                          <span>Issued {new Date(key.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setRevokeTarget({ id: key.id, name: key.name })}
                        disabled={revokeMutation.isPending || !canManage}
                        className="inline-flex shrink-0 items-center gap-1.5 p-1 px-2 border border-brand-border text-text-secondary hover:bg-status-error/10 hover:text-status-error hover:border-status-error/30 rounded-lg font-mono text-xs font-semibold leading-none cursor-pointer transition-colors disabled:opacity-60"
                      >
                        <Trash2 className="w-3 h-3" />
                        Revoke
                      </button>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border border-brand-border-button bg-brand-surface-soft rounded-lg p-1.5 px-3 font-mono text-xs text-text-secondary">
                      <span className="tracking-wide">
                        {key.prefix}
                        <span className="text-text-muted">••••••••••••••••••••</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Activity className="w-3 h-3" />
                        {key.lastUsedAt
                          ? `used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                          : 'never used'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
              />
            )}
          </div>

          {/* Right section: Help & docs */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-brand-border bg-brand-surface p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-mono font-bold text-text-secondary">
                <BookOpen className="w-3.5 h-3.5 text-brand-accent" />
                Documentation
              </div>
              <p className="text-sm text-text-muted font-light leading-relaxed">
                Learn how to authenticate requests, query content, and integrate Wriven into your stack.
              </p>
              <div className="flex flex-col gap-1.5">
                <a
                  href="/docs/authentication"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-mono text-brand-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Authentication & API keys
                </a>
                <a
                  href="/docs/delivery-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-mono text-brand-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Delivery API reference
                </a>
                <a
                  href="/docs/quickstart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-mono text-brand-accent hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Quickstart guide
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        variant="danger"
        title="Revoke API key?"
        description={
          revokeTarget
            ? `Revoking "${revokeTarget.name}" will immediately invalidate it. Any services relying on this key will stop working. This cannot be undone.`
            : undefined
        }
        confirmLabel="Revoke key"
        loading={revokeMutation.isPending}
        lockWhileLoading
        onConfirm={() => {
          if (!revokeTarget) return;
          revokeMutation.mutate(revokeTarget.id);
        }}
      />
    </>
  );
}
