'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { defaultScopePath } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';

/**
 * Legacy / generic entry point. The product is URL-scoped (/w/[ws]/p/[proj]),
 * so this resolves the user's default workspace+project once the session is
 * known and redirects there. Keeps the public site's "Dashboard" link working.
 */
export default function DashboardEntry() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const workspaces = useAuthStore((s) => s.workspaces);
  const projects = useAuthStore((s) => s.projects);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated') {
      const path = defaultScopePath(workspaces, projects);
      // Avoid bouncing back to /dashboard if no workspace resolved.
      router.replace(path === '/dashboard' ? '/login' : path);
    }
  }, [status, workspaces, projects, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg text-text-muted font-mono text-xs uppercase tracking-wider">
      Loading workspace…
    </div>
  );
}
