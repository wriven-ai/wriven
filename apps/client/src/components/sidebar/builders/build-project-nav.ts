import { Database, FileText, Image, Key, LayoutDashboard } from 'lucide-react';
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
  const scope = { workspaceId: workspace.id, projectId: project.id };

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
        permission: 'CONTENT_TYPE_VIEW',
        scope,
      },
      {
        href: `${base}/content`,
        label: 'Content',
        icon: FileText,
        permission: 'CONTENT_VIEW',
        scope,
      },
      {
        href: `${base}/media`,
        label: 'Media Library',
        icon: Image,
        permission: 'MEDIA_VIEW',
        scope,
      },
      {
        href: `${base}/api-keys`,
        label: 'API Keys',
        icon: Key,
        permission: 'API_KEY_VIEW',
        scope,
      },
    ] satisfies Gated<NavItem>[],
    ctx.can,
  );

  return { groupLabel: project.name, items };
}
