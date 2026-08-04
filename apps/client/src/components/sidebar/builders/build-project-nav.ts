import {
  Database,
  FileText,
  Image,
  Key,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import { Permission } from '@wriven/contracts/rbac';
import type { NavContext, NavGroup, NavItem } from '../nav.types';
import { gate, type Gated } from './gate';

/**
 * Project-scope section ("Content Engine"). Present only when both a workspace
 * and a project are resolved from the URL. Pure; returns null otherwise.
 */
export function buildProjectNav(ctx: NavContext): NavGroup | null {
  const { workspace, project } = ctx.data;
  if (!workspace || !project) return null;

  const base = `/w/${workspace.slug}/p/${project.slug}`;

  const items = gate<NavItem>(
    [
      {
        href: base,
        label: 'Overview',
        icon: LayoutDashboard,
        match: 'exact',
      },
      {
        href: `${base}/content-types`,
        label: 'Content Types',
        icon: Database,
        permission: Permission.CONTENT_TYPE_MANAGE,
      },
      {
        href: `${base}/content`,
        label: 'Content',
        icon: FileText,
        permission: Permission.PROJECT_VIEW,
      },
      {
        href: `${base}/media`,
        label: 'Media Library',
        icon: Image,
        permission: Permission.MEDIA_MANAGE,
      },
      {
        href: `${base}/api-keys`,
        label: 'API Keys',
        icon: Key,
        permission: Permission.API_KEY_MANAGE,
      },
      {
        href: `${base}/members`,
        label: 'Members',
        icon: Users,
        permission: Permission.PROJECT_MEMBERS_VIEW,
      },
      {
        href: `${base}/settings`,
        label: 'Project Settings',
        icon: Settings,
        permission: Permission.PROJECT_EDIT,
      },
    ] satisfies Gated<NavItem>[],
    ctx.can,
  );

  return { groupLabel: project.name, items };
}
