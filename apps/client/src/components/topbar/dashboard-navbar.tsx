'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Moon,
  Search,
  Sun,
  User,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserAvatar } from '@/components/ui/user-avatar';
import { WorkspaceSwitcher } from './workspace-switcher';
import { ProjectSwitcher } from './project-switcher';

/**
 * Dashboard top bar. Owns the scope breadcrumb (workspace always; project only
 * in project scope), quick search, theme toggle, notifications and the user
 * menu. Self-contained so the dashboard layout stays a thin composition shell.
 */
export function DashboardNavbar() {
  const { projSlug } = useParams<{ projSlug?: string }>();
  const { user } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === 'dark';

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <header className="h-14 border-b border-brand-border bg-brand-surface/90 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-4 sm:px-5 shrink-0">
      {/* At dashboard/workspace level the workspace switcher lives in the sidebar
          top. Inside a project it moves here, alongside the project switcher. */}
      <div className="flex items-center gap-1.5">
        <SidebarTrigger className="text-text-secondary hover:text-text-primary hover:bg-brand-surface-soft border border-transparent hover:border-brand-border rounded-lg transition-all" />
        {projSlug ? (
          <>
            <WorkspaceSwitcher />
            <ChevronRight className="w-3 h-3 text-brand-border-button shrink-0" />
            <ProjectSwitcher />
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 bg-brand-surface-soft border border-brand-border px-3 py-1.5 rounded-lg max-w-[190px]">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="text"
            placeholder="Quick Search... (⌘K)"
            className="bg-transparent border-none text-sm font-mono outline-hidden w-full placeholder:text-text-muted/65 text-text-primary"
            disabled
          />
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 text-text-secondary hover:text-brand-accent hover:bg-brand-surface-soft rounded-lg border border-transparent hover:border-brand-border transition-all cursor-pointer"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-500" />
          ) : (
            <Moon className="w-4 h-4 text-brand-accent" />
          )}
        </button>

        <button className="relative p-2 text-text-secondary hover:text-brand-accent hover:bg-brand-surface-soft rounded-lg border border-transparent hover:border-brand-border transition-all cursor-pointer">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-secondary" />
        </button>

        <span className="h-5 w-px bg-brand-border" />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 hover:bg-brand-surface-soft p-1.5 rounded-lg border border-transparent hover:border-brand-border transition-all cursor-pointer"
          >
            <UserAvatar
              name={user?.name ?? '?'}
              src={user?.avatar}
              size={28}
            />
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 mt-2 w-48 bg-brand-surface border border-brand-border rounded-xl shadow-lg z-50 p-2 text-left"
                >
                  <div className="px-3 py-2 border-b border-brand-border mb-1.5">
                    <div className="text-sm font-mono font-bold text-text-primary">
                      {user?.name ?? 'Loading…'}
                    </div>
                    <div className="text-sm font-mono text-text-muted truncate">
                      {user?.email ?? ''}
                    </div>
                  </div>
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono text-text-secondary hover:text-brand-accent hover:bg-brand-surface-soft/80"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <User className="w-3.5 h-3.5" />
                    Profile
                  </Link>
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono text-text-secondary hover:text-brand-accent hover:bg-brand-surface-soft/80"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Back to Website
                  </Link>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
