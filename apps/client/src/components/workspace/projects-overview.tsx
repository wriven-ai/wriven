'use client';

import Link from 'next/link';
import { ArrowUpRight, FolderKanban, Plus } from 'lucide-react';
import { useState } from 'react';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import { useCreateProject } from '@/hooks/use-create-project';
import { CreateEntityDialog } from '@/components/topbar/create-entity-dialog';

/**
 * The workspace home: a grid of the current workspace's projects. Shared by
 * /dashboard (default workspace) and /w/[ws] (explicit workspace) — the active
 * workspace is resolved by useWorkspaceProjects (URL slug, or default).
 */
export function ProjectsOverview() {
  const { workspace, projects, isLoading } = useWorkspaceProjects();
  const { mutation, error, setError } = useCreateProject(
    workspace ? { id: workspace.id, slug: workspace.slug } : null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-black text-text-primary">
            {workspace?.name ?? 'Workspace'}
          </h1>
          <p className="font-mono text-2xs tracking-wider text-text-muted uppercase">
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
        <p className="font-mono text-xs text-text-muted">Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border p-10 text-center">
          <p className="font-mono text-xs text-text-muted">
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
                  <p className="truncate font-mono text-xs font-bold text-text-primary group-hover:text-brand-accent">
                    {p.name}
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">
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
