import Header from '../components/Header';
import Footer from '../components/Footer';
import Hero from '../components/Hompage/Hero';
import ProblemStatement from '../components/Hompage/ProblemStatement';
import CoreCapabilities from '../components/Hompage/CoreCapabilities';
import CoreFeaturesWireframe from '../components/Hompage/CoreFeaturesWireframe';
import HowItWorks from '../components/Hompage/HowItWorks';
import CompilerLab from '../components/Hompage/CompilerLab';
import SandboxPlayground from '../components/Hompage/SandboxPlayground';
import EdgeBento from '../components/Hompage/EdgeBento';
import WeaveRegistry from '../components/Hompage/WeaveRegistry';
import OutputRegistry from '../components/Hompage/OutputRegistry';
import Testimonials from '../components/Hompage/Testimonials';
import PricingBanner from '../components/Hompage/PricingBanner';
import BottomCta from '../components/Hompage/BottomCta';
import { getPlans } from '../lib/server/plans';
import type { PlanView } from '../lib/types';

/** Real plan prices → AggregateOffer; falls back to a free-tier Offer. */
function buildOffers(plans: PlanView[] | null) {
  const monthly = (plans ?? [])
    .map((p) => (p.priceMonthly ?? 0) / 100)
    .filter((n) => Number.isFinite(n));
  if (monthly.length === 0) {
    return {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier available',
    };
  }
  return {
    '@type': 'AggregateOffer',
    lowPrice: Math.min(...monthly),
    highPrice: Math.max(...monthly),
    priceCurrency: 'USD',
    offerCount: monthly.length,
  };
}

export default async function Index() {
  // ISR-cached fetch (1h); null when the gateway is unreachable — the page
  // still renders with the free-tier fallback offer.
  const plans = await getPlans();

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://www.wriven.tech/#organization',
        name: 'Wriven',
        url: 'https://www.wriven.tech',
        logo: 'https://www.wriven.tech/favicon.ico',
        founder: {
          '@type': 'Person',
          name: 'Anowar Hosen',
        },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://www.wriven.tech/#website',
        url: 'https://www.wriven.tech',
        name: 'Wriven',
        publisher: { '@id': 'https://www.wriven.tech/#organization' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Wriven',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description:
          'AI-native headless CMS with a built-in AI co-writer and a clean REST delivery API for any framework.',
        url: 'https://www.wriven.tech',
        offers: buildOffers(plans),
      },
    ],
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-brand-bg text-text-primary"
      id="wriven-landing-page"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Header />

      <main className="flex-grow">
        <Hero />
        <ProblemStatement />
        <CoreCapabilities />
        <CoreFeaturesWireframe />
        <HowItWorks />
        <CompilerLab />
        <SandboxPlayground />
        <EdgeBento />
        <WeaveRegistry />
        <OutputRegistry />
        <Testimonials />
        <PricingBanner />
        <BottomCta />
      </main>

      <Footer />
    </div>
  );
}
