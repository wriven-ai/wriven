'use client';

import { useRouter } from 'next/navigation';
import WrivenLogo from '@/components/WrivenLogo';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { buildNavTree } from './build-nav-tree';
import { NavTreeRenderer } from './nav-tree-renderer';
import { useNavContext } from './use-nav-context';

/**
 * Composition root for the sidebar: context (URL) -> brain (buildNavTree) ->
 * dumb renderer -> shell. The workspace/project switchers in the footer are
 * pure navigation — selecting one changes the URL, which is the source of truth.
 */
export function AppSidebar() {
  const ctx = useNavContext();
  const tree = buildNavTree(ctx);
  const router = useRouter();
  const { user } = useAuth();

  const { workspace, project, workspaces, projects } = ctx.data;

  const onSwitchWorkspace = (slug: string) => {
    if (slug && slug !== workspace?.slug) router.push(`/w/${slug}`);
  };
  const onSwitchProject = (slug: string) => {
    if (workspace && slug && slug !== project?.slug) {
      router.push(`/w/${workspace.slug}/p/${slug}`);
    }
  };

  return (
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

      {/* Scoped nav, derived from the URL */}
      <SidebarContent>
        <NavTreeRenderer tree={tree} />
      </SidebarContent>

      {/* Footer: status, switchers (navigation), user */}
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

          {/* Workspace switcher → navigates */}
          <select
            value={workspace?.slug ?? ''}
            onChange={(e) => onSwitchWorkspace(e.target.value)}
            className="w-full bg-sidebar-accent border border-sidebar-border rounded-lg px-2 py-1.5 text-2xs font-mono text-sidebar-foreground focus:outline-none focus:border-brand-accent cursor-pointer"
            aria-label="Switch workspace"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.slug}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Project switcher → navigates */}
          <select
            value={project?.slug ?? ''}
            onChange={(e) => onSwitchProject(e.target.value)}
            className="w-full bg-sidebar-accent border border-sidebar-border rounded-lg px-2 py-1.5 text-2xs font-mono text-sidebar-foreground focus:outline-none focus:border-brand-accent cursor-pointer disabled:opacity-50"
            aria-label="Switch project"
            disabled={!workspace || projects.length === 0}
          >
            {projects.length === 0 ? (
              <option value="">No projects</option>
            ) : null}
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
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
  );
}
