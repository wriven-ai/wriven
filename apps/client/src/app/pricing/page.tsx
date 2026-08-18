'use client';

import { ArrowRight, Check, HelpCircle, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import Footer from '../../components/Footer';
import Header from '../../components/Header';
import { usePublicPlans } from '@/hooks/use-public-plans';
import { useAuth } from '@/hooks/useAuth';
import type { PlanFeatures, PlanLimits, PlanView } from '@/lib/types';

const PricingPage = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    'annual',
  );
  const { isAuthenticated } = useAuth();
  const { data: plans, isLoading, isError } = usePublicPlans();

  const sorted = [...(plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div
      className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain"
      id="wriven-pricing-page"
    >
      <Header />

      <main className="flex-grow py-16 lg:py-24 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Page Heading */}
          <div
            className="text-center max-w-3xl mx-auto space-y-4 mb-16"
            id="pricing-header-info"
          >
            <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase animate-fade-in">
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
              Lock in annual billing for a stable 10% savings.
            </p>

            <div
              className="pt-6 flex justify-center items-center gap-4"
              id="billing-choice-selector"
            >
              <span
                className={`text-sm font-mono font-bold uppercase tracking-wider ${billingCycle === 'monthly' ? 'text-text-primary' : 'text-text-muted'}`}
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
                className={`text-sm font-mono font-bold uppercase tracking-wider flex items-center gap-2 ${billingCycle === 'annual' ? 'text-brand-accent' : 'text-text-muted'}`}
              >
                Billed Annually
                <span className="inline-flex items-center text-sm bg-brand-accent text-white border border-brand-border-button px-2 py-0.5 rounded font-mono font-bold uppercase">
                  Save 10%
                </span>
              </span>
            </div>
          </div>

          {/* Pricing cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-24">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[420px] bg-brand-surface border border-brand-border-button rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : isError || sorted.length === 0 ? (
            <div className="text-center text-text-muted text-sm font-mono py-24 mb-24">
              Couldn&apos;t load plans. Please try again later.
            </div>
          ) : (
            <PricingCards
              plans={sorted}
              billingCycle={billingCycle}
              isAuthenticated={isAuthenticated}
            />
          )}

          {/* Comparison matrix */}
          {!isLoading && sorted.length > 0 && (
            <ComparisonMatrix plans={sorted} />
          )}

          {/* FAQ */}
          <PricingFaq isAuthenticated={isAuthenticated} />
        </div>
      </main>

      <Footer />
    </div>
  );
};

// ── Pricing cards ───────────────────────────────────────────────────────────

function PricingCards({
  plans,
  billingCycle,
  isAuthenticated,
}: {
  plans: PlanView[];
  billingCycle: 'monthly' | 'annual';
  isAuthenticated: boolean;
}) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch mb-24 max-w-6xl mx-auto"
      id="pricing-matrix-cards"
    >
      {plans.map((plan, i) => {
        const popular = i === 1; // middle tier (starter)
        const cents =
          billingCycle === 'annual'
            ? (plan.priceYearly ?? 0)
            : (plan.priceMonthly ?? 0);
        const display = cents / 100;
        return (
          <div
            key={plan.key}
            className={`relative flex flex-col justify-between bg-brand-surface border border-brand-border-button rounded-xl p-8 shadow-2xl transition-all duration-300 neo-shadow-lg ${
              popular ? 'ring-2 ring-brand-accent/25' : ''
            }`}
            id={`plan-card-${plan.key}`}
          >
            {popular && (
              <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2">
                <span className="inline-flex items-center gap-1.5 bg-brand-secondary border border-brand-border-button text-white text-sm font-semibold tracking-wider px-3 py-1 rounded shadow-lg">
                  <Sparkles className="w-3 h-3 text-white" />
                  Most Popular
                </span>
              </div>
            )}

            <div className="space-y-6">
              <div className="text-left">
                <h3 className="font-display font-bold text-xl text-text-primary uppercase tracking-tight">
                  {plan.name}
                </h3>
                <p className="text-sm text-text-secondary mt-2 min-h-[40px] font-light italic">
                  {plan.description}
                </p>
              </div>

              <div className="py-5 border-t border-b border-brand-border text-left">
                <div className="flex items-baseline">
                  <span className="text-3xl font-light text-brand-accent font-display font-serif italic">
                    $
                  </span>
                  <span className="text-5xl font-extrabold text-text-primary font-serif tracking-tight">
                    {display % 1 === 0 ? display : display.toFixed(2)}
                  </span>
                  <span className="text-sm font-mono text-text-muted ml-2 font-bold select-none uppercase">
                    / month
                  </span>
                </div>
                <p className="text-sm font-mono text-text-muted mt-1.5 uppercase font-bold tracking-wider">
                  {plan.priceMonthly === 0
                    ? 'Forever free to build'
                    : `Billed ${billingCycle === 'annual' ? 'annually' : 'monthly'}`}
                </p>
              </div>

              <ul className="space-y-3 text-sm text-text-secondary text-left font-light font-mono">
                {cardHighlights(plan).map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-8">
              <Link
                href={isAuthenticated ? '/dashboard' : '/register'}
                className={`block text-center font-mono font-bold text-sm uppercase tracking-wider py-4 px-4 rounded-lg border border-brand-border-button transition-all duration-150 cursor-pointer neo-shadow ${
                  popular
                    ? 'bg-brand-accent hover:bg-brand-accent-hover text-white'
                    : 'bg-brand-surface-soft hover:bg-brand-border text-text-primary'
                }`}
                id={`plan-cta-${plan.key}`}
              >
                {isAuthenticated
                  ? 'Go to Dashboard'
                  : plan.priceMonthly === 0
                    ? 'Get started'
                    : `Start ${plan.name}`}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Top highlights for a plan card (short, human). */
function cardHighlights(plan: PlanView): string[] {
  const l = plan.limits;
  return [
    `${fmtCount(l.members)} members`,
    `${fmtCount(l.projects)} projects`,
    `${fmtCount(l.entries)} entries`,
    `${fmtStorage(l.storageMb)} storage`,
    `${fmtCount(l.apiRequestsPerMonth)} API calls / mo`,
    plan.features.revisionHistory ? 'Revision history' : 'Community support',
  ];
}

// ── Comparison matrix ───────────────────────────────────────────────────────

type LimitRow = {
  label: string;
  get: (l: PlanLimits) => number | null | undefined;
  fmt?: (n: number) => string;
};

const LIMIT_ROWS: LimitRow[] = [
  { label: 'Members (seats)', get: (l) => l.members, fmt: fmtCount },
  { label: 'Projects', get: (l) => l.projects, fmt: fmtCount },
  { label: 'Entries', get: (l) => l.entries, fmt: fmtCount },
  { label: 'Content types', get: (l) => l.contentTypes, fmt: fmtCount },
  { label: 'API requests / month', get: (l) => l.apiRequestsPerMonth, fmt: fmtCount },
  { label: 'Storage', get: (l) => l.storageMb, fmt: fmtStorage },
  { label: 'Bandwidth', get: (l) => l.assetBandwidthGb, fmt: fmtBandwidth },
  { label: 'API keys', get: (l) => l.apiKeys, fmt: fmtCount },
  { label: 'Webhooks', get: (l) => l.webhooks, fmt: fmtCount },
  { label: 'Revisions / entry', get: (l) => l.revisionsPerEntry, fmt: fmtCount },
  { label: 'AI text / month', get: (l) => l.aiTextRequestsPerMonth, fmt: fmtCount },
  { label: 'AI images / month', get: (l) => l.aiImageRequestsPerMonth, fmt: fmtCount },
];

type FeatureRow = {
  label: string;
  get: (f: PlanFeatures) => boolean | undefined;
  future?: boolean;
};

const FEATURE_ROWS: FeatureRow[] = [
  { label: 'Preview API', get: (f) => f.previewApi },
  { label: 'Revision history', get: (f) => f.revisionHistory },
  { label: 'Scheduled publishing', get: (f) => f.scheduledPublishing, future: true },
  { label: 'Custom roles', get: (f) => f.customRoles, future: true },
  { label: 'Audit log', get: (f) => f.auditLog, future: true },
];

function ComparisonMatrix({ plans }: { plans: PlanView[] }) {
  const cell = (v: number | null | undefined, fmt?: (n: number) => string) => {
    if (v == null) return 'Unlimited';
    return fmt ? fmt(v) : String(v);
  };
  return (
    <div className="space-y-6 mb-24 text-left max-w-5xl mx-auto" id="feature-comparison-matrix-section">
      <h3 className="font-display font-medium text-2xl text-text-primary text-center">
        Full Feature Breakdown
      </h3>
      <div
        className="overflow-x-auto rounded-xl border border-brand-border-button bg-brand-surface shadow-xl neo-shadow-lg"
        id="pricing-matrix-wrapper"
      >
        <table className="w-full min-w-[650px] text-left border-collapse" id="pricing-matrix-table">
          <thead>
            <tr className="bg-brand-surface-soft border-b border-brand-border-button">
              <th className="p-4.5 text-sm font-mono font-bold uppercase text-text-muted tracking-wider">
                Features &amp; Capabilities
              </th>
              {plans.map((p, i) => (
                <th
                  key={p.key}
                  className={`p-4.5 text-sm font-mono font-bold uppercase tracking-wider ${
                    i === 1 ? 'text-brand-accent bg-brand-accent/5' : 'text-text-secondary'
                  }`}
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border text-sm font-mono">
            {LIMIT_ROWS.map((row) => (
              <tr key={row.label} className="hover:bg-brand-surface-soft/40 transition-colors">
                <td className="p-4 font-sans font-bold text-text-primary">{row.label}</td>
                {plans.map((p, i) => (
                  <td
                    key={p.key}
                    className={`p-4 text-text-secondary ${i === 1 ? 'bg-brand-accent/5 font-bold text-brand-accent' : ''}`}
                  >
                    {cell(row.get(p.limits), row.fmt)}
                  </td>
                ))}
              </tr>
            ))}
            {FEATURE_ROWS.map((row) => (
              <tr key={row.label} className="hover:bg-brand-surface-soft/40 transition-colors">
                <td className="p-4 font-sans font-bold text-text-primary">
                  {row.label}
                  {row.future && (
                    <span className="ml-1 text-sm text-text-muted font-normal">(future)</span>
                  )}
                </td>
                {plans.map((p, i) => {
                  const on = row.get(p.features);
                  return (
                    <td
                      key={p.key}
                      className={`p-4 ${i === 1 ? 'bg-brand-accent/5' : ''}`}
                    >
                      {on ? (
                        <Check className="w-4 h-4 text-status-success" />
                      ) : (
                        <X className="w-4 h-4 text-status-error opacity-50" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="hover:bg-brand-surface-soft/40 transition-colors">
              <td className="p-4 font-sans font-bold text-text-primary">Support tier</td>
              {plans.map((p, i) => (
                <td
                  key={p.key}
                  className={`p-4 capitalize text-text-secondary ${i === 1 ? 'bg-brand-accent/5 font-bold text-brand-accent' : ''}`}
                >
                  {p.features.supportTier}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FAQ + bottom CTA (copy kept; discount updated to 10%) ────────────────────

function PricingFaq({ isAuthenticated }: { isAuthenticated: boolean }) {
  const faqs = [
    {
      question: "How are 'AI Content generations' counted?",
      answer:
        "Every time you use Wriven's AI to draft text or generate an image, it counts against your plan's monthly AI quota. Standard manual edits or Delivery API requests do not consume AI credits. (AI Image generation is coming soon.)",
    },
    {
      question: 'Can I upgrade or downgrade my plan at any time?',
      answer:
        'Yes. You can upgrade mid-month (we prorate the difference), and downgrades or cancellations take effect at the end of your current billing cycle via the self-serve Billing Portal.',
    },
    {
      question: 'What happens if I exceed my monthly limits?',
      answer:
        'We notify you as you approach your plan thresholds. Count-based limits (projects, entries, members) block new creates; metered limits (API requests) are enforced softly so a live site keeps serving while you upgrade.',
    },
    {
      question: 'Is there any setup or hosting cost?',
      answer:
        'None. Wriven is fully cloud-hosted — structured content, media, and the Delivery API are all operated for you. No infrastructure to manage.',
    },
  ];
  return (
    <>
      <div className="max-w-3xl mx-auto space-y-8 text-left" id="faqs-section">
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
              <p className="text-sm text-text-secondary leading-relaxed pl-7 font-light font-serif italic">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-24 text-center bg-brand-surface border border-brand-border-button p-8 sm:p-12 rounded-xl shadow-2xl relative overflow-hidden neo-shadow-lg max-w-5xl mx-auto"
        id="pricing-bottom-cta"
      >
        <div className="relative z-10 space-y-5">
          <h3 className="font-display font-medium text-2xl sm:text-3xl text-text-primary">
            Get weaving in less than 2 minutes
          </h3>
          <p className="text-text-secondary text-sm sm:text-sm max-w-xl mx-auto font-light leading-relaxed">
            No contracts or setup overhead. Define your content models, draft
            copy, and ship a typed JSON API — completely free.
          </p>
          <div className="flex justify-center pt-2">
            <Link
              href={isAuthenticated ? '/dashboard' : '/register'}
              className="inline-flex items-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider py-4 px-6 rounded-lg neo-shadow cursor-pointer transition-all"
              id="pricing-bottom-primary"
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Start for free, no card required'}
              <ArrowRight className="w-4 h-4 text-white" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

// ── formatters ──────────────────────────────────────────────────────────────

function fmtCount(n: number | null | undefined): string {
  if (n == null) return 'Unlimited';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}k`;
  return String(n);
}

function fmtStorage(mb: number | null | undefined): string {
  if (mb == null) return 'Unlimited';
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB`;
  return `${mb} MB`;
}

function fmtBandwidth(gb: number | null | undefined): string {
  if (gb == null) return 'Unlimited';
  return `${gb} GB`;
}

export default PricingPage;
