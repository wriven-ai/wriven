'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiRequestError, projectApi } from '@/lib/api';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import { WebhooksSection } from '@/components/webhooks/webhooks-section';
import { useCan } from '@/components/sidebar/use-can';
import { Permission } from '@wriven/contracts/rbac';
import { NoAccess } from '@/components/auth/no-access';

export default function ProjectSettingsPage() {
  const { wsSlug, projSlug } = useParams<{ wsSlug: string; projSlug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const can = useCan();
  const { workspace, projects, isLoading } = useWorkspaceProjects();
  const project = projects.find((p) => p.slug === projSlug) ?? null;

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (project) setName(project.name);
  }, [project]);

  const wsKey = ['projects', workspace?.id];

  const updateMutation = useMutation({
    mutationFn: (dto: { name: string }) => projectApi.update(project!.id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wsKey });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Update failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectApi.remove(project!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wsKey });
      router.replace(`/w/${wsSlug}`);
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Delete failed.'),
  });

  if (isLoading || !project) {
    return <p className="font-mono text-xs text-text-muted">Loading…</p>;
  }

  if (!can(Permission.PROJECT_EDIT)) return <NoAccess />;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="border-b border-brand-border pb-4">
        <h1 className="font-display text-2xl font-black text-text-primary">
          Project Settings
        </h1>
        <p className="font-mono text-2xs tracking-wider text-text-muted uppercase">
          {project.name} · {project.role}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) updateMutation.mutate({ name: name.trim() });
        }}
        className="space-y-4 rounded-xl border border-brand-border bg-brand-surface p-5"
      >
        <h2 className="font-mono text-xs font-bold text-text-primary">General</h2>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
            Project name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-brand-border bg-brand-surface-soft px-3.5 py-2.5 font-mono text-xs text-text-primary focus:border-brand-accent focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
            Slug
          </label>
          <input
            value={project.slug}
            disabled
            className="w-full rounded-lg border border-brand-border bg-brand-surface-soft px-3.5 py-2.5 font-mono text-xs text-text-muted"
          />
        </div>

        {error ? (
          <p className="font-mono text-[10px] text-status-error">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={updateMutation.isPending || name.trim() === project.name}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:bg-brand-accent-hover disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" />
          {updateMutation.isPending ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
      </form>

      <WebhooksSection />

      <div className="space-y-3 rounded-xl border border-status-error/30 bg-status-error/5 p-5">
        <h2 className="font-mono text-xs font-bold text-status-error">Danger zone</h2>
        <p className="font-mono text-[10px] text-text-muted">
          Deleting a project removes its content types, entries and media. This cannot be undone.
        </p>
        <button
          onClick={() => {
            if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-status-error/40 px-4 py-2 font-mono text-xs font-bold text-status-error transition-colors hover:bg-status-error/10 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleteMutation.isPending ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </div>
  );
}
