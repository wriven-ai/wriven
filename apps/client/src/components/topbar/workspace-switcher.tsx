'use client';

import { Layers } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useCurrentWorkspace } from '@/hooks/use-current-workspace';
import { useCreateWorkspace } from '@/hooks/use-create-workspace';
import { CreateEntityDialog } from './create-entity-dialog';
import { ScopeSwitcher, type SwitcherItem } from './scope-switcher';

/** Workspace switcher. `block` for the sidebar top, `breadcrumb` for the top bar.
 *  Shows the current workspace (URL slug, or the default at /dashboard). */
export function WorkspaceSwitcher({
  variant = 'breadcrumb',
}: {
  variant?: 'breadcrumb' | 'block';
}) {
  const router = useRouter();
  const { wsSlug } = useParams<{ wsSlug?: string }>();
  const workspaces = useAuthStore((s) => s.workspaces);
  const current = useCurrentWorkspace();
  const { mutation, error, setError } = useCreateWorkspace();
  const [createOpen, setCreateOpen] = useState(false);

  const items: SwitcherItem[] = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
  }));

  return (
    <>
      <ScopeSwitcher
        variant={variant}
        icon={variant === 'block' ? undefined : <Layers className="h-3.5 w-3.5" />}
        current={current ? { id: current.id, name: current.name, slug: current.slug } : null}
        items={items}
        badge={current?.role}
        titleHref={wsSlug && current ? `/w/${current.slug}` : '/dashboard'}
        placeholder="Select workspace"
        createLabel="New workspace"
        emptyText="No workspaces."
        onSelect={(item) => router.push(`/w/${item.slug}`)}
        onCreate={() => {
          setError(null);
          setCreateOpen(true);
        }}
      />

      <CreateEntityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create workspace"
        description="Workspaces group your projects, members and billing."
        label="Workspace name"
        placeholder="Acme Inc."
        submitLabel="Create workspace"
        pending={mutation.isPending}
        error={error}
        onSubmit={(name) => mutation.mutate(name)}
      />
    </>
  );
}
