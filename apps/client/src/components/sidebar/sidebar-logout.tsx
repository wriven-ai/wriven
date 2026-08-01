'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useLogout } from '@/hooks/useAuth';

/**
 * Sidebar footer logout control. Calls the logout API (revoke session) via
 * useLogout, then clears local state and redirects to /login. Collapses to an
 * icon-only button when the sidebar is in icon mode.
 */
export function SidebarLogout() {
  const logout = useLogout();
  const [pending, setPending] = useState(false);

  const onLogout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {/* Expanded */}
      <button
        onClick={onLogout}
        disabled={pending}
        className="group-data-[collapsible=icon]:hidden flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent px-2.5 py-2 font-mono text-2xs font-bold text-sidebar-foreground transition-colors hover:border-status-error/40 hover:text-status-error disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" />
        {pending ? 'Logging out…' : 'Log out'}
      </button>

      {/* Collapsed — icon only */}
      <button
        onClick={onLogout}
        disabled={pending}
        aria-label="Log out"
        className="hidden group-data-[collapsible=icon]:flex h-7 w-7 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent text-sidebar-foreground transition-colors hover:text-status-error disabled:opacity-60"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
