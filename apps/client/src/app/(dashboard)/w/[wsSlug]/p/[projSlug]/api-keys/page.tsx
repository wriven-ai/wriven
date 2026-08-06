'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Check,
  Copy,
  Folder,
  Key,
  Plus,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { ApiRequestError, apiKeyApi } from '@/lib/api';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';
import type { ApiKeyScope } from '@/lib/types';

const SCOPES: { value: ApiKeyScope; label: string; desc: string }[] = [
  {
    value: 'read',
    label: 'Read-Only Content Cache',
    desc: 'Fetches published content from the delivery API. Safe to expose client-side.',
  },
  {
    value: 'preview',
    label: 'Read-Only Draft Preview',
    desc: 'Reads drafts + published. Best for preview/staging environments.',
  },
  {
    value: 'manage',
    label: 'Full Read/Write Access',
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

  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<ApiKeyScope>('read');
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

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

  const createMutation = useMutation({
    mutationFn: () => apiKeyApi.create({ name: newName.trim(), scope: newScope }),
    onSuccess: (result) => {
      setNewToken(result.token);
      setNewName('');
      setNewScope('read');
      setError(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Create failed.'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeyApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const createKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) createMutation.mutate();
  };

  const copyToken = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const curlExample = `curl "https://wriven.io/api/v1/projects/${
    projectId || '<projectId>'
  }/content/blog_post" \\\n  -H "Authorization: Bearer wrk_live_…"`;

  if (!canManage) return <NoAccess />;

  return (
    <div className="space-y-8 text-left">
      {/* Header */}
      <div className="border-b border-brand-border pb-5">
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

      {/* Project ID — needed in every Delivery API URL */}
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 sm:p-5 space-y-2">
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
              className="shrink-0 rounded-lg border border-brand-border p-2 text-text-muted hover:text-brand-accent"
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
            className="font-mono text-sm font-bold text-brand-accent hover:underline"
          >
            I&apos;ve saved it — dismiss
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: create */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
          <span className="text-sm font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Commission API Access Token
          </span>

          <form onSubmit={createKey} className="space-y-5">
            <div>
              <label
                className="block text-sm font-mono text-text-secondary mb-1.5"
                htmlFor="api-key-name"
              >
                Token Application Context
              </label>
              <input
                id="api-key-name"
                type="text"
                placeholder="e.g. Production site"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent h-11"
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-1.5">
                Authorization Scope
              </label>
              <div className="space-y-2 mt-1.5">
                {SCOPES.map((s) => (
                  <label
                    key={s.value}
                    className="flex items-start gap-2.5 p-3 rounded-lg border border-brand-border bg-brand-surface-soft/40 cursor-pointer select-none hover:bg-brand-surface-soft"
                  >
                    <input
                      type="radio"
                      name="scope-group"
                      checked={newScope === s.value}
                      onChange={() => setNewScope(s.value)}
                      className="mt-0.5 text-brand-accent border-brand-border cursor-pointer focus:ring-0"
                    />
                    <div>
                      <p className="text-sm font-mono font-bold text-text-primary">
                        {s.label}
                      </p>
                      <p className="text-sm text-text-muted font-light mt-0.5 leading-relaxed">
                        {s.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error ? (
              <p className="font-mono text-sm text-status-error">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={createMutation.isPending || !newName.trim() || !canManage}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:opacity-60 border border-brand-border-button font-mono font-bold text-sm py-3 rounded-lg neo-shadow cursor-pointer transition-all"
            >
              {createMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Generating secure key…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-white" />
                  Generate Access Token
                </>
              )}
            </button>
          </form>

          <div className="bg-brand-surface border border-brand-border p-4 rounded-xl text-left space-y-2">
            <div className="flex items-center gap-2 text-sm font-mono text-status-warning font-black uppercase">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Secure Key Guidelines
            </div>
            <p className="text-sm text-text-secondary leading-relaxed font-light">
              Store management keys in server environment configs (
              <code className="font-mono bg-brand-surface-soft border border-brand-border px-1 rounded text-sm">
                process.env.WRIVEN_TOKEN
              </code>
              ). Never commit them or expose admin keys client-side.
            </p>
          </div>
        </div>

        {/* Right: list */}
        <div className="lg:col-span-7 space-y-4">
          <span className="text-sm font-mono tracking-wider text-text-secondary block px-1 font-bold">
            Active Integration Tokens ({keys?.length ?? 0})
          </span>

          {isLoading ? (
            <p className="font-mono text-sm text-text-muted px-1">Loading…</p>
          ) : !keys || keys.length === 0 ? (
            <p className="font-mono text-sm text-text-muted px-1">
              No keys yet. Create one to connect your site.
            </p>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="bg-brand-surface border border-brand-border hover:border-brand-accent/30 rounded-xl p-5 text-left shadow-xs transition-all"
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 leading-none">
                        <Key className="w-3.5 h-3.5 text-brand-secondary" />
                        <h3 className="font-display font-bold text-sm tracking-tight truncate text-text-primary">
                          {key.name}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-sm font-mono text-text-muted leading-none mt-1">
                        <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1 rounded uppercase font-bold text-sm">
                          {scopeLabel(key.scope)}
                        </span>
                        <span>•</span>
                        <span>Issued {new Date(key.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Revoke key "${key.name}"? Sites using it will stop working. This cannot be undone.`,
                          )
                        ) {
                          revokeMutation.mutate(key.id);
                        }
                      }}
                      disabled={revokeMutation.isPending || !canManage}
                      className="inline-flex shrink-0 items-center gap-1.5 p-1.5 px-2.5 border border-brand-border text-text-secondary hover:bg-status-error/10 hover:text-status-error hover:border-status-error/30 rounded-lg font-mono text-sm font-semibold leading-none cursor-pointer transition-colors disabled:opacity-60"
                    >
                      <Trash2 className="w-3 h-3" />
                      Revoke
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between border border-brand-border-button bg-brand-surface-soft rounded-lg p-2.5 px-3.5 font-mono text-sm text-text-secondary">
                    <span className="tracking-wide">
                      {key.prefix}
                      <span className="text-text-muted">••••••••••••••••••••</span>
                    </span>
                    <span className="flex items-center gap-1 text-sm text-text-muted">
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

          {/* cURL example */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left">
            <h4 className="text-sm font-mono font-bold text-text-primary mb-2 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-brand-secondary" />
              Delivery API Example
            </h4>
            <div className="bg-brand-surface-soft border border-brand-border rounded-lg p-3.5 font-mono text-sm text-text-secondary overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
              {curlExample}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
