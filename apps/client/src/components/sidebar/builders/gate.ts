import type { Permission } from '@wriven/contracts/rbac';
import type { NavContext } from '../nav.types';

/** An item that carries its own access requirement, before gating. */
export type Gated<T> = T & {
  permission?: Permission;
};

/**
 * Filter items by access, then strip the gate field so the output matches the
 * public Nav* type. Extract once instead of repeating the filter in every builder.
 */
export function gate<T>(items: Gated<T>[], can: NavContext['can']): T[] {
  return items
    .filter((i) => !i.permission || can(i.permission))
    .map(({ permission, ...rest }) => rest as T);
}
