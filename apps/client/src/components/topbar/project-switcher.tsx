'use client';

import { Box } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import { useCreateProject } from '@/hooks/use-create-project';
import { CreateEntityDialog } from './create-entity-dialog';
import { ScopeSwitcher, type SwitcherItem } from './scope-switcher';

/** Top-bar project switcher. Rendered only when a project is in scope.
 *  Projects come from the workspace's server-state query (shared cache). */
export function ProjectSwitcher() {
  const router = useRouter();
  const { wsSlug, projSlug } = useParams<{ wsSlug: string; projSlug?: string }>();
  const { workspace, projects } = useWorkspaceProjects();
  const { mutation, error, setError } = useCreateProject(
    workspace ? { id: workspace.id, slug: workspace.slug } : null,
  );
  const [createOpen, setCreateOpen] = useState(false);

  const current = projects.find((p) => p.slug === projSlug) ?? null;
  const items: SwitcherItem[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
  }));

  return (
    <>
      <ScopeSwitcher
        icon={<Box className="h-3.5 w-3.5" />}
        current={current ? { id: current.id, name: current.name, slug: current.slug } : null}
        items={items}
        titleHref={current ? `/w/${wsSlug}/p/${current.slug}` : undefined}
        placeholder="Select project"
        createLabel="New project"
        emptyText="No projects yet."
        onSelect={(item) => router.push(`/w/${wsSlug}/p/${item.slug}`)}
        onCreate={() => {
          setError(null);
          setCreateOpen(true);
        }}
      />

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
    </>
  );
}
