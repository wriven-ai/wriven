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

export default function Index() {
  return (
    <div
      className="min-h-screen flex flex-col bg-brand-bg text-text-primary"
      id="wriven-landing-page"
    >
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
