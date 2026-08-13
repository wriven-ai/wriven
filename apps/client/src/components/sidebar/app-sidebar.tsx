'use client';

import { WorkspaceSwitcher } from '@/components/topbar/workspace-switcher';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { buildNavTree } from './build-nav-tree';
import { NavTreeRenderer } from './nav-tree-renderer';
import { SidebarLogout } from './sidebar-logout';
import { useNavContext } from './use-nav-context';

/**
 * Composition root for the sidebar: context (URL) -> brain (buildNavTree) ->
 * dumb renderer -> shell. The workspace switcher sits at the top of the sidebar
 * at dashboard/workspace level; inside a project it moves to the top bar and the
 * header shows the brand logo. The menu below is scope-exclusive.
 */
export function AppSidebar() {
  const ctx = useNavContext();
  const tree = buildNavTree(ctx);
  const projectScope = !!ctx.params.projSlug;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* One row: brand icon + workspace switcher (in a project the switcher
          moves to the top bar, leaving just the icon). */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-brand-accent flex items-center justify-center text-white font-display font-black text-sm shrink-0">
            W
          </div>
          {!projectScope ? (
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <WorkspaceSwitcher variant="block" />
            </div>
          ) : null}
        </div>
      </SidebarHeader>

      {/* Scoped nav, derived from the URL */}
      <SidebarContent>
        <NavTreeRenderer tree={tree} />
      </SidebarContent>

      {/* Footer: logout */}
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex justify-center px-1 py-1">
          <SidebarLogout />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
