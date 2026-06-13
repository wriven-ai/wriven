'use client';

import { ArrowRight, Check, HelpCircle, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import Footer from '../../components/Footer';
import Header from '../../components/Header';

const PricingPage = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    'annual',
  );

  const plans = [
    {
      name: 'Free',
      description:
        'Perfect for solo developers, side projects, and evaluation.',
      priceMonthly: 0,
      priceAnnual: 0,
      ctaText: 'Get started',
      ctaHref: '/register',
      popular: false,
      features: [
        '3 content types limit',
        '500 content entries',
        '10K API calls per month',
        '20 AI text generations',
        '5 AI image generations',
        '1 GB Media storage',
        '1 Team member seat',
        'Community support',
      ],
      notIncluded: ['Webhooks automation', 'Priority SLAs'],
    },
    {
      name: 'Pro',
      description:
        'Ideal for fast-growing content teams, marketing squads, and production sites.',
      priceMonthly: 59,
      priceAnnual: 47, // ~20% off
      ctaText: 'Start Pro free trial',
      ctaHref: '/register',
      popular: true,
      features: [
        'Unlimited content types',
        'Unlimited content entries',
        '500K API calls per month',
        '500 AI text generations',
        '100 AI image generations',
        '20 GB Media storage',
        '5 Team member seats',
        'Webhooks support',
        'Email customer support',
      ],
      notIncluded: ['Priority SLAs & Dedicated Engineers'],
    },
    {
      name: 'Business',
      description:
        'Engineered for dedicated custom workloads, compliance, and enterprise SLAs.',
      priceMonthly: 'Custom',
      priceAnnual: 'Custom',
      ctaText: 'Contact enterprise',
      ctaHref: '/contact',
      popular: false,
      features: [
        'Unlimited content types',
        'Unlimited content entries',
        'Custom metered API calls',
        'Custom metered AI text generation',
        'Custom metered AI image generation',
        'Custom media storage capacity',
        'Unlimited team members',
        'Webhooks support',
        'Priority SLA support',
        'Dedicated success engineer',
      ],
      notIncluded: [],
    },
  ];

  const comparisonRows = [
    {
      feature: 'Content types limit',
      free: '3',
      pro: 'Unlimited',
      biz: 'Unlimited',
    },
    {
      feature: 'Content entries limit',
      free: '500',
      pro: 'Unlimited',
      biz: 'Unlimited',
    },
    {
      feature: 'API calls / month',
      free: '10K',
      pro: '500K',
      biz: 'Custom scale',
    },
    {
      feature: 'AI text generations',
      free: '20',
      pro: '500',
      biz: 'Custom metered',
    },
    {
      feature: 'AI image generations',
      free: '5',
      pro: '100',
      biz: 'Custom metered',
    },
    {
      feature: 'Media storage',
      free: '1 GB',
      pro: '20 GB',
      biz: 'Custom scale',
    },
    { feature: 'Team members', free: '1', pro: '5', biz: 'Unlimited' },
    { feature: 'Webhooks', free: false, pro: true, biz: true },
    {
      feature: 'Support tier',
      free: 'Community',
      pro: 'Email Support',
      biz: 'Priority 24/7 SLA',
    },
  ];

  const faqs = [
    {
      question: "How are 'AI Content generations' counted?",
      answer:
        'Every time you click the sparkle (✦) button next to any text input to let Wriven draft, or generate content using prompt instructions, it counts as 1 text generation. Standard manual edits or API requests do not consume your AI credits.',
    },
    {
      question: 'Can I upgrade or downgrade my plan at any time?',
      answer:
        'Yes, absolutely! You can upgrade to Pro mid-month, and we will prorate the billing on your account. Downgrades or cancellations will take effect at the end of your current subscription cycle.',
    },
    {
      question: 'What happens if we temporarily exceed our monthly limits?',
      answer:
        'We send friendly notifications when your organization hits 80% and 100% of your plan thresholds. For standard API limits, we offer soft-grace limits so your app continues running cleanly while we contact you.',
    },
    {
      question: 'Is there any setup or hosting cost?',
      answer:
        'None! Wriven is a completely cloud-hosted headless SaaS solution. All structured content, media catalogs, and edge API models are operated continuously on our low-latency CDN layer.',
    },
    {
      question:
        'Do you offer discounts for non-profits or open-source projects?',
      answer:
        'Yes, we are highly supportive of the builder community! Reach out to us via our contact portal or email support and our team will get custom sponsorships set up instantly.',
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain"
      id="wriven-pricing-page"
    >
      <Header />

      <main className="flex-grow py-16 lg:py-24 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Page Heading info */}
          <div
            className="text-center max-w-3xl mx-auto space-y-4 mb-16"
            id="pricing-header-info"
          >
            <span className="text-xs font-semibold tracking-wider text-brand-secondary uppercase animate-fade-in">
              Wriven Subscriptions
            </span>
            <h1
              className="font-display font-medium leading-tight tracking-tight text-text-primary text-4xl sm:text-5xl"
              id="pricing-main-title"
            >
              Simpler plans for teams of any scale
            </h1>
            <p className="text-text-secondary text-sm leading-relaxed font-light">
              Start weaving content completely free, no credit card required.
              Lock in annual billing terms to achieve stable 20% savings.
            </p>

            {/* Toggle monthly / annual pricing structure */}
            <div
              className="pt-6 flex justify-center items-center gap-4"
              id="billing-choice-selector"
            >
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider ${billingCycle === 'monthly' ? 'text-text-primary' : 'text-text-muted'}`}
              >
                Billed Monthly
              </span>
              <button
                type="button"
                onClick={() =>
                  setBillingCycle(
                    billingCycle === 'monthly' ? 'annual' : 'monthly',
                  )
                }
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-brand-border-button bg-brand-surface-soft transition-colors duration-200 ease-in-out focus:outline-none"
                id="billing-cycle-switch"
                role="switch"
                aria-checked={billingCycle === 'annual'}
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-brand-accent shadow ring-0 transition duration-200 mt-1 ease-in-out ${
                    billingCycle === 'annual'
                      ? 'translate-x-5'
                      : 'translate-x-[3px]'
                  }`}
                />
              </button>
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-2 ${billingCycle === 'annual' ? 'text-brand-accent' : 'text-text-muted'}`}
              >
                Billed Annually
                <span className="inline-flex items-center text-[9px] bg-brand-accent text-white border border-brand-border-button px-2 py-0.5 rounded font-mono font-bold uppercase">
                  Save 20%
                </span>
              </span>
            </div>
          </div>

          {/* Pricing cards side-by-side layout */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-24 max-w-6xl mx-auto"
            id="pricing-matrix-cards"
          >
            {plans.map((p) => {
              const displayPrice =
                billingCycle === 'annual' ? p.priceAnnual : p.priceMonthly;
              return (
                <div
                  key={p.name}
                  className={`relative flex flex-col justify-between bg-brand-surface border border-brand-border-button rounded-xl p-8 shadow-2xl transition-all duration-300 neo-shadow-lg ${
                    p.popular ? 'ring-2 ring-brand-accent/25' : ''
                  }`}
                  id={`plan-card-${p.name.toLowerCase()}`}
                >
                  {p.popular && (
                    <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2">
                      <span className="inline-flex items-center gap-1.5 bg-brand-secondary border border-brand-border-button text-white text-[10px] font-semibold tracking-wider px-3 py-1 rounded shadow-lg">
                        <Sparkles className="w-3 h-3 text-white" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="text-left">
                      <h3 className="font-display font-bold text-xl text-text-primary uppercase tracking-tight">
                        {p.name}
                      </h3>
                      <p className="text-xs text-text-secondary mt-2 min-h-[40px] font-light italic">
                        {p.description}
                      </p>
                    </div>

                    <div className="py-5 border-t border-b border-brand-border text-left">
                      {typeof displayPrice === 'number' ? (
                        <div className="flex items-baseline">
                          <span className="text-3xl font-light text-brand-accent font-display font-serif italic">
                            $
                          </span>
                          <span className="text-5xl font-extrabold text-text-primary font-serif tracking-tight">
                            {displayPrice}
                          </span>
                          <span className="text-xs font-mono text-text-muted ml-2 font-bold select-none uppercase">
                            / month
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-baseline">
                          <span className="text-4xl font-extrabold text-text-primary font-display tracking-tight font-serif italic">
                            {displayPrice}
                          </span>
                        </div>
                      )}
                      <p className="text-[10px] font-mono text-text-muted mt-1.5 uppercase font-bold tracking-wider">
                        {p.name === 'Free'
                          ? 'Forever free to build'
                          : typeof displayPrice === 'number'
                            ? `Billed ${billingCycle === 'annual' ? 'annually' : 'monthly'}`
                            : 'Requires custom scoping'}
                      </p>
                    </div>

                    <ul className="space-y-3 text-xs text-text-secondary text-left font-light font-mono">
                      {p.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {p.notIncluded &&
                        p.notIncluded.map((feat) => (
                          <li
                            key={feat}
                            className="flex items-start gap-2 text-text-muted opacity-50"
                          >
                            <X className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
                            <span className="line-through">{feat}</span>
                          </li>
                        ))}
                    </ul>
                  </div>

                  <div className="pt-8">
                    <Link
                      href={p.ctaHref}
                      className={`block text-center font-mono font-bold text-xs uppercase tracking-wider py-4 px-4 rounded-lg border border-brand-border-button transition-all duration-150 cursor-pointer neo-shadow ${
                        p.popular
                          ? 'bg-brand-accent hover:bg-brand-accent-hover text-white'
                          : 'bg-brand-surface-soft hover:bg-brand-border text-text-primary'
                      }`}
                      id={`plan-cta-${p.name.toLowerCase()}`}
                    >
                      {p.ctaText}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feature Matrix / Comparison Table - Styled like Accountant Ledger */}
          <div
            className="space-y-6 mb-24 text-left max-w-5xl mx-auto"
            id="feature-comparison-matrix-section"
          >
            <h3 className="font-display font-medium text-2xl text-text-primary text-center">
              Full Feature Breakdown
            </h3>

            <div
              className="overflow-x-auto rounded-xl border border-brand-border-button bg-brand-surface shadow-xl neo-shadow-lg"
              id="pricing-matrix-wrapper"
            >
              <table
                className="w-full min-w-[650px] text-left border-collapse"
                id="pricing-matrix-table"
              >
                <thead>
                  <tr className="bg-brand-surface-soft border-b border-brand-border-button">
                    <th className="p-4.5 text-xs font-mono font-bold uppercase text-text-muted tracking-wider">
                      Features & Capabilities
                    </th>
                    <th className="p-4.5 text-xs font-mono font-bold uppercase text-text-secondary tracking-wider">
                      Free Plan
                    </th>
                    <th className="p-4.5 text-xs font-mono font-bold uppercase text-brand-accent tracking-wider bg-brand-accent/5">
                      Pro Plan
                    </th>
                    <th className="p-4.5 text-xs font-mono font-bold uppercase text-text-secondary tracking-wider">
                      Business Plan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border text-xs font-mono">
                  {comparisonRows.map((row) => (
                    <tr
                      key={row.feature}
                      className="hover:bg-brand-surface-soft/40 transition-colors"
                    >
                      <td className="p-4 font-sans font-bold text-text-primary">
                        {row.feature}
                      </td>
                      <td className="p-4 text-text-secondary">
                        {typeof row.free === 'boolean' ? (
                          row.free ? (
                            <Check className="w-4 h-4 text-status-success" />
                          ) : (
                            <X className="w-4 h-4 text-status-error" />
                          )
                        ) : (
                          row.free
                        )}
                      </td>
                      <td className="p-4 bg-brand-accent/5 font-bold text-brand-accent">
                        {typeof row.pro === 'boolean' ? (
                          row.pro ? (
                            <Check className="w-4 h-4 text-status-success" />
                          ) : (
                            <X className="w-4 h-4 text-status-error" />
                          )
                        ) : (
                          row.pro
                        )}
                      </td>
                      <td className="p-4 text-text-secondary">
                        {typeof row.biz === 'boolean' ? (
                          row.biz ? (
                            <Check className="w-4 h-4 text-status-success" />
                          ) : (
                            <X className="w-4 h-4 text-status-error" />
                          )
                        ) : (
                          row.biz
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FAQ section - Styled like Modern Press Cards */}
          <div
            className="max-w-3xl mx-auto space-y-8 text-left"
            id="faqs-section"
          >
            <h3 className="font-display font-medium text-2xl text-text-primary text-center">
              Frequently Asked Questions
            </h3>
            <div className="space-y-4 mt-8" id="faqs-accordion">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className="p-6 bg-brand-surface border border-brand-border-button rounded-xl shadow-xl space-y-2 neo-shadow hover:-translate-y-0.5 transition-all"
                  id={`faq-card-${i}`}
                >
                  <h4 className="font-display font-bold text-sm text-text-primary flex items-start gap-2.5">
                    <HelpCircle className="w-5 h-5 text-brand-accent shrink-0 mt-0.5" />
                    <span>{faq.question}</span>
                  </h4>
                  <p className="text-xs text-text-secondary leading-relaxed pl-7 font-light font-serif italic">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Call action */}
          <div
            className="mt-24 text-center bg-brand-surface border border-brand-border-button p-8 sm:p-12 rounded-xl shadow-2xl relative overflow-hidden neo-shadow-lg max-w-5xl mx-auto"
            id="pricing-bottom-cta"
          >
            <div className="relative z-10 space-y-5">
              <h3 className="font-display font-medium text-2xl sm:text-3xl text-text-primary">
                Get weaving in less than 2 minutes
              </h3>
              <p className="text-text-secondary text-xs sm:text-sm max-w-xl mx-auto font-light leading-relaxed">
                No contracts or setup overheads. Configure your target content
                models, generate copy blocks, and deploy instantaneous JSON APIs
                completely free.
              </p>
              <div className="flex justify-center pt-2">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-4 px-6 rounded-lg neo-shadow cursor-pointer transition-all"
                  id="pricing-bottom-primary"
                >
                  Start for free, no card required
                  <ArrowRight className="w-4 h-4 text-white" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PricingPage;
