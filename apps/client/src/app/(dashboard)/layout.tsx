'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  Search,
  Bell,
  ExternalLink,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { RequireAuth } from '../../components/auth/RequireAuth';
import { AppSidebar } from '@/components/sidebar/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

/** Turn the last path segment into a readable breadcrumb label. */
function segmentLabel(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  // Skip dynamic id-ish segments; fall back to "Console".
  if (!last || last === 'w' || last === 'p') return 'Console';
  return last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const { user } = useAuth();

  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('wriven-theme', 'dark');
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('wriven-theme', 'light');
      setTheme('light');
    }
  };

  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />

        {/* Main content */}
        <SidebarInset className="bg-brand-bg editorial-grid paper-grain">
          {/* Top header bar */}
          <header className="h-14 border-b border-brand-border bg-brand-surface/90 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-4 sm:px-5 shrink-0">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="text-text-secondary hover:text-text-primary hover:bg-brand-surface-soft border border-transparent hover:border-brand-border rounded-lg transition-all" />
              <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-text-muted">
                <span>Wriven</span>
                <ChevronRight className="w-3 h-3 text-brand-border-button" />
                <span className="text-text-primary font-bold">
                  {segmentLabel(pathname)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 bg-brand-surface-soft border border-brand-border px-3 py-1.5 rounded-lg max-w-[190px]">
                <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <input
                  type="text"
                  placeholder="Quick Search... (⌘K)"
                  className="bg-transparent border-none text-2xs font-mono outline-hidden w-full placeholder:text-text-muted/65 text-text-primary"
                  disabled
                />
              </div>

              <button
                onClick={toggleTheme}
                className="p-2 text-text-secondary hover:text-brand-accent hover:bg-brand-surface-soft rounded-lg border border-transparent hover:border-brand-border transition-all cursor-pointer"
              >
                {theme === 'dark' ? (
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

              {/* User dropdown */}
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-1.5 hover:bg-brand-surface-soft p-1.5 rounded-lg border border-transparent hover:border-brand-border transition-all cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-md bg-brand-accent text-white font-mono font-bold text-xs flex items-center justify-center">
                    {(user?.name ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
                </button>

                <AnimatePresence>
                  {userDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setUserDropdownOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="absolute right-0 mt-2 w-48 bg-brand-surface border border-brand-border rounded-xl shadow-lg z-50 p-2 text-left"
                      >
                        <div className="px-3 py-2 border-b border-brand-border mb-1.5">
                          <div className="text-2xs font-mono font-bold text-text-primary">
                            {user?.name ?? 'Loading…'}
                          </div>
                          <div className="text-[10px] font-mono text-text-muted truncate">
                            {user?.email ?? ''}
                          </div>
                        </div>
                        <Link
                          href="/"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono text-text-secondary hover:text-brand-accent hover:bg-brand-surface-soft/80"
                          onClick={() => setUserDropdownOpen(false)}
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

          {/* Page content */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto select-none">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}
