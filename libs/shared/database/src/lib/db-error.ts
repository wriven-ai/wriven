/**
 * Postgres error fields the app's catch blocks rely on (SQLSTATE code +
 * constraint name). drizzle-orm 0.45 wraps the postgres.js driver error as
 * `{ query, params, cause }` — the raw PostgresError (with `code` /
 * `constraint_name`) lives on `cause`. Raw postgres.js errors carry the same
 * fields on the error itself. This helper returns the driver-level fields
 * regardless of which shape the caller received, or `undefined` for any
 * non-Postgres error (validation, app errors, etc.).
 */
export interface DbError {
  /** SQLSTATE code, e.g. `23505` for a unique-violation. */
  code: string;
  /** Constraint name, e.g. `content_entries_project_type_slug_uq`. */
  constraint: string;
}

/**
 * Walk a bounded `cause` chain so the helper survives if a future wrapper adds
 * another layer (pool wrapper, driver upgrade). Each hop must itself look like a
 * Postgres error (`code` is a 5-char SQLSTATE) — a plain Error with an unrelated
 * `code` property is not treated as one, so app-level errors keep returning
 * `undefined` even when they carry a `cause`.
 */
export function dbError(err: unknown): DbError | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') return undefined;
    const e = current as Record<string, unknown>;
    const code = e.code;
    if (typeof code === 'string' && SQLSTATE.test(code)) {
      const constraint = e.constraint_name ?? e.constraint;
      return {
        code,
        constraint: typeof constraint === 'string' ? constraint : '',
      };
    }
    const cause = e.cause;
    if (!cause || cause === current) return undefined;
    current = cause;
  }
  return undefined;
}

/** PostgreSQL SQLSTATE is exactly 5 chars: digits and uppercase A–Z. */
const SQLSTATE = /^[0-9A-Z]{5}$/;
