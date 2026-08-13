/**
 * The billing window shared by every metered resource in core-service.
 *
 * Calendar month with **UTC** midnight boundaries. This must be the only
 * definition: `date_trunc('month', now())` resolves in the database session
 * timezone, so mixing the two lets AI quota, `/usage`, and stats disagree about
 * which month a generation belongs to on a non-UTC connection. See specs/21.
 */
export function currentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
