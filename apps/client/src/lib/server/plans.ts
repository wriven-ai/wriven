import type { PlanView } from '@/lib/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/v1';

/**
 * Server-side public plan catalog fetch, ISR-cached for an hour. Powers the
 * server-rendered /pricing page and the homepage's JSON-LD offers.
 *
 * Returns `null` on any failure (gateway unreachable at build/ISR time) so
 * the page still renders — the client falls back to `usePublicPlans`.
 */
export async function getPlans(): Promise<PlanView[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/plans`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as
      | { success: true; data: PlanView[] }
      | { success: false }
      | null;
    if (!json || json.success !== true || !Array.isArray(json.data)) return null;
    return json.data;
  } catch {
    return null;
  }
}
