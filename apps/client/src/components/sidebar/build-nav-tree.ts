import type { NavContext, NavGroup, NavTree } from './nav.types';
import { buildProjectNav } from './builders/build-project-nav';
import { buildWorkspaceNav } from './builders/build-workspace-nav';

/** Include a group only when it exists (and an optional condition holds). */
const maybe = (g: NavGroup | null, cond = true): NavGroup[] =>
  g && cond ? [g] : [];

/**
 * The brain. Pure + synchronous: plain `NavContext` in, declarative `NavTree`
 * out. No React, no fetch, no `window`. Adding a section = one builder + one
 * line here.
 *
 * Composition today is additive (workspace group + project group). When a
 * feature needs an exclusive "focused" sidebar, branch here with an early
 * return before the additive list (see the spec's exclusive sub-context).
 */
export function buildNavTree(ctx: NavContext): NavTree {
  return [
    ...maybe(buildWorkspaceNav(ctx)),
    ...maybe(buildProjectNav(ctx)),
  ];
}
