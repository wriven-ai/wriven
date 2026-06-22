'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home,
  Database,
  FileText,
  Image,
  Key,
  Settings,
  Activity,
  ChevronRight,
  Search,
  Bell,
  ExternalLink,
  Sun,
  Moon,
  ChevronDown,
  Layers,
  FolderKanban,
  CreditCard,
} from 'lucide-react';
import WrivenLogo from '../../components/WrivenLogo';
import { useAuth } from '../../hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section: 'engine' | 'admin' | 'metrics';
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard Home', href: '/dashboard', icon: Home, section: 'engine' },
  { name: 'Content Types', href: '/dashboard/content-types', icon: Database, section: 'engine' },
  { name: 'Content Editor', href: '/dashboard/content', icon: FileText, section: 'engine' },
  { name: 'Media Library', href: '/dashboard/media', icon: Image, section: 'engine' },
  { name: 'Projects', href: '/dashboard/projects', icon: FolderKanban, section: 'admin' },
  { name: 'Workspaces', href: '/dashboard/workspaces', icon: Layers, section: 'admin' },
  { name: 'API Keys', href: '/dashboard/api-keys', icon: Key, section: 'admin' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, section: 'admin' },
  { name: 'Usage & Stats', href: '/dashboard/usage', icon: Activity, section: 'metrics' },
  { name: 'Billing', href: '/dashboard/billing', icon: CreditCard, section: 'metrics' },
];

const SECTION_LABELS: Record<string, string> = {
  engine: 'Content Engine',
  admin: 'Platform Admin',
  metrics: 'Metrics',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const {
    user,
    workspaces,
    currentWorkspaceProjects,
    currentWorkspaceId,
    currentProjectId,
    setWorkspace,
    setProject,
  } = useAuth();

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

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const getBreadcrumb = () =>
    NAV_ITEMS.find(item => isActive(item.href))?.name ?? 'Console';

  const renderGroup = (section: 'engine' | 'admin' | 'metrics') => (
    <SidebarGroup key={section}>
      <SidebarGroupLabel className="font-mono text-[9px] tracking-widest uppercase">
        {SECTION_LABELS[section]}
      </SidebarGroupLabel>
      <SidebarMenu>
        {NAV_ITEMS.filter(item => item.section === section).map(item => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              isActive={isActive(item.href)}
              tooltip={item.name}
              render={<Link href={item.href} />}
              className="font-mono text-xs"
            >
              <item.icon />
              <span>{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">

        {/* Logo */}
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-brand-accent flex items-center justify-center text-white font-display font-black text-sm shrink-0">
              W
            </div>
            <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden overflow-hidden">
              <WrivenLogo />
              <span className="text-[9px] font-mono text-brand-secondary bg-brand-secondary/10 border border-brand-secondary/20 px-1.5 py-0.5 rounded font-semibold uppercase shrink-0">
                Core
              </span>
            </div>
          </div>
        </SidebarHeader>

        {/* Nav */}
        <SidebarContent>
          {renderGroup('engine')}
          <SidebarSeparator />
          {renderGroup('admin')}
          <SidebarSeparator />
          {renderGroup('metrics')}
        </SidebarContent>

        {/* User footer */}
        <SidebarFooter className="border-t border-sidebar-border">
          {/* Expanded state */}
          <div className="group-data-[collapsible=icon]:hidden px-1 py-1 space-y-2">
            <div className="flex items-center justify-between text-[9px] font-mono text-text-muted">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                API Gateway: Active
              </span>
              <span className="bg-sidebar-accent border border-sidebar-border px-1.5 py-0.5 rounded text-[8px] font-bold">
                eu-west
              </span>
            </div>

            {/* Workspace switcher */}
            <select
              value={currentWorkspaceId ?? undefined}
              onChange={(e) => setWorkspace(e.target.value)}
              className="w-full bg-sidebar-accent border border-sidebar-border rounded-lg px-2 py-1.5 text-2xs font-mono text-sidebar-foreground focus:outline-none focus:border-brand-accent cursor-pointer"
              aria-label="Switch workspace"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            {/* Project switcher */}
            <select
              value={currentProjectId ?? undefined}
              onChange={(e) => setProject(e.target.value)}
              className="w-full bg-sidebar-accent border border-sidebar-border rounded-lg px-2 py-1.5 text-2xs font-mono text-sidebar-foreground focus:outline-none focus:border-brand-accent cursor-pointer"
              aria-label="Switch project"
            >
              {currentWorkspaceProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 bg-sidebar-accent border border-sidebar-border p-2 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-brand-accent/15 flex items-center justify-center font-bold text-xs text-brand-accent shrink-0 border border-sidebar-border">
                {(user?.name ?? '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-2xs font-mono font-bold text-sidebar-foreground truncate leading-tight">
                  {user?.name ?? 'Loading…'}
                </p>
                <p className="text-[9px] font-mono text-text-muted truncate leading-snug">
                  {user?.email ?? ''}
                </p>
              </div>
            </div>
          </div>

          {/* Collapsed state — icon only */}
          <div className="hidden group-data-[collapsible=icon]:flex justify-center py-1">
            <div className="w-7 h-7 rounded-full bg-brand-accent/15 flex items-center justify-center font-bold text-xs text-brand-accent border border-sidebar-border">
              {(user?.name ?? '?').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </SidebarFooter>

      </Sidebar>

      {/* Main content */}
      <SidebarInset className="bg-brand-bg editorial-grid paper-grain">

        {/* Top header bar */}
        <header className="h-14 border-b border-brand-border bg-brand-surface/90 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-4 sm:px-5 shrink-0">

          <div className="flex items-center gap-2.5">
            <SidebarTrigger className="text-text-secondary hover:text-text-primary hover:bg-brand-surface-soft border border-transparent hover:border-brand-border rounded-lg transition-all" />
            <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-text-muted">
              <span>Wriven</span>
              <ChevronRight className="w-3 h-3 text-brand-border-button" />
              <span className="text-text-primary font-bold">{getBreadcrumb()}</span>
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
              {theme === 'dark'
                ? <Sun className="w-4 h-4 text-amber-500" />
                : <Moon className="w-4 h-4 text-brand-accent" />}
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
                    <div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
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
  );
}
