// The nav-config contract. Everything in the sidebar "brain" produces or
// consumes this tree. The builders emit it; <NavTreeRenderer> consumes it.
// Keep this file free of React/runtime imports beyond types.

import type { ComponentType, SVGProps } from 'react';

export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/** A leaf link inside a collapsible section. */
export type NavLeaf = {
  href: string;
  label: string;
  icon?: IconType;
  /** Explicit active override; if omitted, the renderer derives it from the pathname. */
  active?: boolean;
  /** How to derive active when `active` is absent. 'exact' for leaves, 'prefix' for parents. Default 'prefix'. */
  match?: 'exact' | 'prefix';
  /** Optional row extra (count/badge). */
  badge?: string | number;
};

/** A labelled group of leaves inside one collapsible item. */
export type NavSubGroup = {
  groupLabel: string;
  items: NavLeaf[];
};

/** A top-level entry: a flat link, or a collapsible when `submenus` is non-empty. */
export type NavItem = {
  href: string; // "" when it's a pure container with no destination of its own
  label: string;
  icon?: IconType;
  active?: boolean;
  match?: 'exact' | 'prefix';
  /** Force the collapsible permanently open (e.g. the active entity's block). */
  defaultOpen?: boolean;
  badge?: string | number;
  submenus?: NavSubGroup[];
};

/** A sidebar section with an optional heading. */
export type NavGroup = {
  groupLabel: string; // "" => render no heading
  items: NavItem[];
};

export type NavTree = NavGroup[];

// ── Context the brain consumes ───────────────────────────────────────────────

/** The single object `buildNavTree` receives. Assembled once per render by the
 *  `useNavContext` seam, outside the tree builders. Pure data + one access fn. */
export type NavContext = {
  /** Current path; source of truth for active-state and feature scope. */
  pathname: string;
  /** Resolved route context. Names mirror our domain. */
  params: {
    wsSlug?: string;
    projSlug?: string;
    /** First path segment after the project, when a feature is focused. */
    feature?: string;
  };
  /** Single access gate, injected. Builders call only this — never auth internals. */
  can: (permission: string, scope?: Record<string, string>) => boolean;
  /** Pre-resolved data the nav needs. Never fetched inside a builder. */
  data: NavData;
};

export type NavEntityRef = {
  id: string;
  name: string;
  slug: string;
};

export type NavData = {
  /** The workspace the current URL resolves to, if any. */
  workspace: NavEntityRef | null;
  /** The project the current URL resolves to, if any. */
  project: NavEntityRef | null;
  /** All workspaces the user can switch to. */
  workspaces: NavEntityRef[];
  /** Projects within the active workspace. */
  projects: NavEntityRef[];
};
