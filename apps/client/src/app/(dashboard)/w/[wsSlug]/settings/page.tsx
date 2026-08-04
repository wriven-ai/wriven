'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Save, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ApiRequestError, memberApi, workspaceApi } from '@/lib/api';
import { useCurrentWorkspace } from '@/hooks/use-current-workspace';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';

export default function WorkspaceSettingsPage() {
  const workspace = useCurrentWorkspace();
  const can = useCan();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setSlug(workspace.slug);
    }
  }, [workspace]);

  const isOwner = workspace?.role === 'owner';

  // Real member data — count + role breakdown.
  const { data: members } = useQuery({
    queryKey: ['workspace-members', workspace?.id],
    queryFn: () => memberApi.list(workspace!.id),
    enabled: !!workspace,
  });
  const roleCounts = (members ?? []).reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] ?? 0) + 1;
    return acc;
  }, {});

  const updateMutation = useMutation({
    mutationFn: (dto: { name: string; slug: string }) =>
      workspaceApi.update(workspace!.id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
      // Slug may have changed — keep the URL in sync.
      if (updated.slug !== workspace!.slug) {
        router.replace(`/w/${updated.slug}/settings`);
      }
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Update failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => workspaceApi.remove(workspace!.id),
    onSuccess: () => router.replace('/dashboard'),
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Delete failed.'),
  });

  if (!workspace) {
    return <p className="font-mono text-xs text-text-muted">Loading…</p>;
  }

  const dirty = name.trim() !== workspace.name || slug.trim() !== workspace.slug;

  const copyId = () => {
    navigator.clipboard.writeText(workspace.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!can(Permission.WORKSPACE_EDIT)) return <NoAccess />;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="border-b border-brand-border pb-4">
        <h1 className="font-display text-2xl font-black text-text-primary">
          Workspace Settings
        </h1>
        <p className="font-mono text-2xs tracking-wider text-text-muted uppercase">
          {workspace.name} · {workspace.role}
        </p>
      </div>

      {/* General */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && slug.trim()) {
            updateMutation.mutate({ name: name.trim(), slug: slug.trim() });
          }
        }}
        className="space-y-4 rounded-xl border border-brand-border bg-brand-surface p-5"
      >
        <h2 className="font-mono text-xs font-bold text-text-primary">General</h2>

        <Field label="Workspace name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner}
            className={inputCls}
          />
        </Field>

        <Field label="Slug" hint="Used in the URL: /w/<slug>">
          <input
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
            }
            disabled={!isOwner}
            className={inputCls}
          />
        </Field>

        <Field label="Workspace ID">
          <div className="flex items-center gap-2">
            <input value={workspace.id} disabled className={`${inputCls} text-text-muted`} />
            <button
              type="button"
              onClick={copyId}
              className="shrink-0 rounded-lg border border-brand-border p-2 text-text-muted hover:text-brand-accent"
              aria-label="Copy workspace id"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </Field>

        {error ? (
          <p className="font-mono text-[10px] text-status-error">{error}</p>
        ) : null}

        {isOwner ? (
          <button
            type="submit"
            disabled={updateMutation.isPending || !dirty}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:bg-brand-accent-hover disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {updateMutation.isPending ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        ) : (
          <p className="font-mono text-[10px] text-text-muted">
            Only the owner can change workspace settings.
          </p>
        )}
      </form>

      {/* Members (real count + roles) */}
      <div className="space-y-3 rounded-xl border border-brand-border bg-brand-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-mono text-xs font-bold text-text-primary">
            <Users className="h-3.5 w-3.5 text-text-muted" />
            Members
          </h2>
          <Link
            href={`/w/${workspace.slug}/members`}
            className="font-mono text-2xs font-bold text-brand-accent hover:underline"
          >
            Manage →
          </Link>
        </div>
        <p className="font-mono text-2xs text-text-secondary">
          {members ? `${members.length} member${members.length === 1 ? '' : 's'}` : 'Loading…'}
        </p>
        {members && members.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(roleCounts).map(([role, count]) => (
              <span
                key={role}
                className="rounded border border-brand-border bg-brand-surface-soft px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-text-muted uppercase"
              >
                {count} {role}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Danger zone */}
      {isOwner ? (
        <div className="space-y-3 rounded-xl border border-status-error/30 bg-status-error/5 p-5">
          <h2 className="font-mono text-xs font-bold text-status-error">Danger zone</h2>
          <p className="font-mono text-[10px] text-text-muted">
            Deleting a workspace removes its projects and content. This cannot be undone.
          </p>
          <button
            onClick={() => {
              if (confirm(`Delete workspace "${workspace.name}"? This cannot be undone.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-status-error/40 px-4 py-2 font-mono text-xs font-bold text-status-error transition-colors hover:bg-status-error/10 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteMutation.isPending ? 'Deleting…' : 'Delete workspace'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-brand-border bg-brand-surface-soft px-3.5 py-2.5 font-mono text-xs text-text-primary focus:border-brand-accent focus:outline-none disabled:opacity-60';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
        {label}
      </label>
      {children}
      {hint ? <p className="font-mono text-[9px] text-text-muted">{hint}</p> : null}
    </div>
  );
}
