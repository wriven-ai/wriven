'use client';

import Link from 'next/link';
import { ArrowUpRight, FolderKanban, Plus } from 'lucide-react';
import { useState } from 'react';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import { useCreateProject } from '@/hooks/use-create-project';
import { CreateEntityDialog } from '@/components/topbar/create-entity-dialog';
import { useAuth } from '@/hooks/useAuth';

/**
 * The workspace home: a grid of the current workspace's projects. Shared by
 * /dashboard (default workspace) and /w/[ws] (explicit workspace) — the active
 * workspace is resolved by useWorkspaceProjects (URL slug, or default).
 */
export function ProjectsOverview() {
  const { workspace, projects, isLoading } = useWorkspaceProjects();
  const { user } = useAuth();
  const { mutation, error, setError } = useCreateProject(
    workspace ? { id: workspace.id, slug: workspace.slug } : null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  const displayName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* Welcome Banner */}
      <div className="bg-brand-surface border border-brand-border-button rounded-xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          {/* <div className="inline-flex items-center gap-1.5 bg-brand-accent/10 border border-brand-accent/20 px-2.5 py-1 rounded-md text-sm font-mono font-bold text-brand-accent">
            <Sparkles className="w-3.5 h-3.5" />
            Wriven AI Engine — Ready
          </div> */}
          <h1 className="font-display font-medium text-2xl sm:text-3xl text-text-primary tracking-tight leading-none">
            Welcome back, <span className="font-normal italic text-brand-secondary">{displayName}.</span>
          </h1>
          <p className="text-sm sm:text-sm text-text-secondary font-light leading-relaxed">
            Build content models, manage entries, and deliver across channels.
          </p>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-brand-secondary/5 to-transparent pointer-events-none select-none" />
      </div>

      <div className="flex items-end justify-between pt-6">
        <div>
          <h2 className="font-display text-lg font-bold text-text-primary">
            {workspace?.name ?? 'Workspace'}
          </h2>
          <p className="font-mono text-sm tracking-wider text-text-muted uppercase">
            Projects
          </p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2.5 font-mono text-xs font-bold tracking-wider text-white uppercase transition-all hover:bg-brand-accent-hover"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {isLoading ? (
        <p className="font-mono text-sm text-text-muted">Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border p-10 text-center">
          <p className="font-mono text-sm text-text-muted">
            No projects yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/w/${workspace?.slug}/p/${p.slug}`}
              className="group flex items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-surface p-4 transition-colors hover:border-brand-accent"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-text-primary group-hover:text-brand-accent">
                    {p.name}
                  </p>
                  <p className="font-mono text-sm text-text-muted">
                    {p.slug} · {p.role}
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted group-hover:text-brand-accent" />
            </Link>
          ))}
        </div>
      )}

      <CreateEntityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create project"
        description="A project owns its content types, entries and media."
        label="Project name"
        placeholder="Marketing site"
        submitLabel="Create project"
        pending={mutation.isPending}
        error={error}
        onSubmit={(name) => mutation.mutate(name)}
      />
    </div>
  );
}
