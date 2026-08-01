import type { NavContext } from '../nav.types';

/** An item that carries its own access requirement, before gating. */
export type Gated<T> = T & {
  permission?: string;
  scope?: Record<string, string>;
};

/**
 * Filter items by access, then strip the gate fields so the output matches the
 * public Nav* type. Extract once instead of repeating the filter in every builder.
 */
export function gate<T>(items: Gated<T>[], can: NavContext['can']): T[] {
  return items
    .filter((i) => !i.permission || can(i.permission, i.scope))
    .map(({ permission, scope, ...rest }) => rest as T);
}
