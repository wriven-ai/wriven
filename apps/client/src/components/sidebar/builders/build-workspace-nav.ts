import {
  Activity,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Users,
} from 'lucide-react';
import { Permission } from '@wriven/contracts/rbac';
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
        href: `${base}/members`,
        label: 'Members',
        icon: Users,
        permission: Permission.WORKSPACE_MEMBERS_VIEW,
      },
      {
        href: `${base}/usage`,
        label: 'Usage & Stats',
        icon: Activity,
        permission: Permission.WORKSPACE_USAGE_VIEW,
      },
      {
        href: `${base}/billing`,
        label: 'Billing',
        icon: CreditCard,
        permission: Permission.WORKSPACE_BILLING_MANAGE,
      },
      {
        href: `${base}/settings`,
        label: 'Workspace Settings',
        icon: Settings,
        permission: Permission.WORKSPACE_EDIT,
      },
      {
        href: `${base}/support`,
        label: 'Support',
        icon: LifeBuoy,
      },
    ] satisfies Gated<NavItem>[],
    ctx.can,
  );

  return { groupLabel: workspace.name, items };
}
