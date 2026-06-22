'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiRequestError, projectApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function ProjectsPage() {
  const { currentWorkspace, currentWorkspaceId, setProject } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', currentWorkspaceId],
    queryFn: () => projectApi.list(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (dto: { name: string }) =>
      projectApi.create(currentWorkspaceId!, dto),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] });
      setProject(project.id);
      setName('');
      setShowCreate(false);
      setError(null);
    },
    onError: (err) =>
      setError(
        err instanceof ApiRequestError ? err.message : 'Failed to create project.',
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => projectApi.remove(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['projects', currentWorkspaceId] }),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-text-primary tracking-tight">
            Projects
          </h1>
          <p className="text-xs font-mono text-text-muted mt-1">
            Workspace: {currentWorkspace?.name ?? '—'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg transition-all"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMutation.mutate({ name: name.trim() });
          }}
          className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3"
        >
          <label className="block text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
            className="w-full text-xs font-mono rounded-lg bg-brand-surface-soft border border-brand-border px-3.5 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent text-text-primary"
          />
          {error && (
            <p className="text-[10px] font-mono text-status-error">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg disabled:opacity-60"
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setName('');
                setError(null);
              }}
              className="font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-lg border border-brand-border text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs font-mono text-text-muted">Loading projects…</p>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-brand-surface border border-brand-border rounded-xl p-4 flex items-start justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-accent/10 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <p className="text-xs font-mono font-bold text-text-primary">
                    {p.name}
                  </p>
                  <p className="text-[10px] font-mono text-text-muted">
                    {p.slug} · {p.role}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeMutation.mutate(p.id)}
                className="text-text-muted hover:text-status-error transition-colors p-1"
                aria-label={`Delete ${p.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs font-mono text-text-muted">
          No projects yet. Create one to get started.
        </p>
      )}
    </div>
  );
}
