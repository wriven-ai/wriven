'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, projectApi } from '@/lib/api';
import type { ProjectView } from '@/lib/types';

/**
 * Shared "create project" flow used by the project switcher and the workspace
 * overview. Seeds the project into the workspace's query cache (so the
 * destination's scope sync resolves the slug at once) and navigates into it.
 */
export function useCreateProject(
  workspace: { id: string; slug: string } | null,
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (name: string) => projectApi.create(workspace!.id, { name }),
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectView[]>(
        ['projects', workspace!.id],
        (old) => [...(old ?? []), project],
      );
      queryClient.invalidateQueries({ queryKey: ['projects', workspace!.id] });
      setError(null);
      router.push(`/w/${workspace!.slug}/p/${project.slug}`);
    },
    onError: (err) =>
      setError(
        err instanceof ApiRequestError ? err.message : 'Failed to create project.',
      ),
  });

  return { mutation, error, setError };
}
