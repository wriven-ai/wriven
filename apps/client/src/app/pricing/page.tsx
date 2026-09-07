import { getPlans } from '@/lib/server/plans';
import { PricingClient } from '@/components/pricing/pricing-client';

/**
 * Server shell for /pricing — fetches the public plan catalog at render time
 * (ISR, 1h) and hands it to the interactive client surface. Plans land in the
 * prerendered HTML for SEO/LCP; the client query only takes over when the
 * server fetch failed (gateway unreachable).
 */
export default async function PricingPage() {
  const plans = await getPlans();
  return <PricingClient initialPlans={plans} />;
}
