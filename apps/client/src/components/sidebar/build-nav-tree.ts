import { Home } from 'lucide-react';
import type { NavContext, NavGroup, NavTree } from './nav.types';
import { buildProjectNav } from './builders/build-project-nav';
import { buildWorkspaceNav } from './builders/build-workspace-nav';

/** Include a group only when it exists (and an optional condition holds). */
const maybe = (g: NavGroup | null, cond = true): NavGroup[] =>
  g && cond ? [g] : [];

/** Standalone "Home" link back to the dashboard overview, shown inside a project. */
const homeGroup: NavGroup = {
  groupLabel: '',
  items: [{ href: '/dashboard', label: 'Home', icon: Home, match: 'exact' }],
};

/**
 * The brain. Pure + synchronous: plain `NavContext` in, declarative `NavTree`
 * out. No React, no fetch, no `window`.
 *
 * Scope is exclusive, driven by the URL:
 *  - project scope (projSlug present) → only the project menu.
 *  - workspace scope → only the workspace menu.
 * The current workspace always shows in the sidebar header switcher, separate
 * from these groups.
 */
export function buildNavTree(ctx: NavContext): NavTree {
  if (ctx.params.projSlug) {
    return [homeGroup, ...maybe(buildProjectNav(ctx))];
  }
  return [...maybe(buildWorkspaceNav(ctx))];
}
