import {
  Activity,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import type { NavContext, NavGroup, NavItem } from '../nav.types';
import { gate, type Gated } from './gate';

/**
 * Workspace-scope section. Present whenever a workspace is resolved from the URL.
 * Pure: derives everything from `ctx`, returns null when out of context.
 */
export function buildWorkspaceNav(ctx: NavContext): NavGroup | null {
  const { workspace } = ctx.data;
  if (!workspace) return null;

  const base = `/w/${workspace.slug}`;

  const items = gate<NavItem>(
    [
      {
        href: base,
        label: 'Overview',
        icon: LayoutDashboard,
        match: 'exact',
      },
      {
        href: `${base}/projects`,
        label: 'Projects',
        icon: FolderKanban,
        permission: 'PROJECT_VIEW',
        scope: { workspaceId: workspace.id },
      },
      {
        href: `${base}/members`,
        label: 'Members',
        icon: Users,
        permission: 'MEMBER_VIEW',
        scope: { workspaceId: workspace.id },
      },
      {
        href: `${base}/usage`,
        label: 'Usage & Stats',
        icon: Activity,
      },
      {
        href: `${base}/billing`,
        label: 'Billing',
        icon: CreditCard,
        permission: 'BILLING_VIEW',
        scope: { workspaceId: workspace.id },
      },
      {
        href: `${base}/settings`,
        label: 'Settings',
        icon: Settings,
        permission: 'WORKSPACE_SETTINGS_VIEW',
        scope: { workspaceId: workspace.id },
      },
    ] satisfies Gated<NavItem>[],
    ctx.can,
  );

  return { groupLabel: workspace.name, items };
}
