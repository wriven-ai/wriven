'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, workspaceApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

/**
 * Shared "create workspace" flow used by the sidebar switcher and the account
 * overview. Hydrates the new workspace into the store (so URL nav resolves it
 * immediately) and navigates into it.
 */
export function useCreateWorkspace() {
  const router = useRouter();
  const addWorkspace = useAuthStore((s) => s.addWorkspace);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (name: string) => workspaceApi.create({ name }),
    onSuccess: ({ workspace }) => {
      addWorkspace(workspace);
      setError(null);
      router.push(`/w/${workspace.slug}`);
    },
    onError: (err) =>
      setError(
        err instanceof ApiRequestError ? err.message : 'Failed to create workspace.',
      ),
  });

  return { mutation, error, setError };
}
