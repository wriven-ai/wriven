'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  Check,
  Zap,
  Users,
  Layers,
  Globe,
  Download,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';

interface Invoice {
  id: string;
  date: string;
  description: string;
  amount: string;
  status: 'Paid' | 'Upcoming';
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'For personal projects and exploration.',
    features: [
      '5 org members',
      '10 workspaces',
      '500k API requests / mo',
      '50 GB CDN bandwidth',
      '1 GB media storage',
      'Community support',
    ],
    cta: 'Current Plan',
    current: true,
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For growing teams shipping production content.',
    features: [
      '15 org members',
      'Unlimited workspaces',
      '2M API requests / mo',
      '500 GB CDN bandwidth',
      '10 GB media storage',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    current: false,
    highlight: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: '$49',
    period: '/month',
    description: 'For large teams with high-volume content ops.',
    features: [
      'Unlimited members',
      'Unlimited workspaces',
      '10M API requests / mo',
      'Unlimited CDN bandwidth',
      '100 GB media storage',
      'Dedicated support',
      'Custom domain delivery',
    ],
    cta: 'Upgrade to Team',
    current: false,
    highlight: false,
  },
];

const PLAN_FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'org members': Users,
  'workspaces': Layers,
  'API requests': Zap,
  'CDN bandwidth': Globe,
  'media storage': Globe,
  'support': ShieldCheck,
  'domain': Globe,
};

function getFeatureIcon(feature: string) {
  const key = Object.keys(PLAN_FEATURE_ICONS).find(k => feature.toLowerCase().includes(k));
  return key ? PLAN_FEATURE_ICONS[key] : Check;
}

export default function BillingPage() {
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);

  const invoices: Invoice[] = [
    { id: 'inv_001', date: '2026-06-01', description: 'Wriven Free Plan — June 2026', amount: '$0.00', status: 'Paid' },
    { id: 'inv_002', date: '2026-05-01', description: 'Wriven Free Plan — May 2026', amount: '$0.00', status: 'Paid' },
    { id: 'inv_003', date: '2026-04-01', description: 'Wriven Free Plan — April 2026', amount: '$0.00', status: 'Paid' },
  ];

  const handleUpgrade = (planId: string) => {
    setIsUpgrading(planId);
    setTimeout(() => setIsUpgrading(null), 1500);
  };

  return (
    <div className="space-y-8 text-left" id="billing-workspace">

      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Billing & <span className="font-normal italic text-brand-secondary">Subscription</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Manage your plan, payment method, and review past invoices"}
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold bg-brand-surface border border-brand-border text-text-secondary px-3 py-1.5 rounded-lg uppercase tracking-wider">
          Current: Free Plan
        </span>
      </div>

      {/* Plan comparison + current billing summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Plan cards */}
        <div className="lg:col-span-8 space-y-4" id="plan-cards">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block px-1 font-bold">
            Available Plans
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <div
                key={plan.id}
                className={`relative bg-brand-surface rounded-xl p-5 shadow-xs flex flex-col gap-4 transition-all ${
                  plan.highlight
                    ? 'border-2 border-brand-accent'
                    : 'border border-brand-border'
                }`}
                id={`plan-card-${plan.id}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-[9px] font-mono font-black uppercase tracking-widest bg-brand-accent text-white px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-base text-text-primary tracking-tight">
                      {plan.name}
                    </h3>
                    {plan.current && (
                      <span className="text-[8px] font-bold font-mono uppercase bg-brand-surface-soft border border-brand-border text-text-secondary px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="font-display font-black text-2xl text-text-primary">{plan.price}</span>
                    <span className="text-2xs font-mono text-text-muted">{plan.period}</span>
                  </div>
                  <p className="text-[10.5px] text-text-secondary font-light leading-relaxed">{plan.description}</p>
                </div>

                <ul className="space-y-2 flex-grow">
                  {plan.features.map((feature, i) => {
                    const Icon = getFeatureIcon(feature);
                    return (
                      <li key={i} className="flex items-start gap-2 text-2xs font-mono text-text-secondary">
                        <Icon className="w-3.5 h-3.5 text-brand-secondary mt-0.5 shrink-0" />
                        {feature}
                      </li>
                    );
                  })}
                </ul>

                <button
                  onClick={() => !plan.current && handleUpgrade(plan.id)}
                  disabled={plan.current || isUpgrading === plan.id}
                  className={`w-full inline-flex items-center justify-center gap-1.5 font-mono font-bold text-2xs py-2.5 rounded-lg border cursor-pointer transition-all ${
                    plan.current
                      ? 'border-brand-border text-text-muted bg-brand-surface-soft cursor-not-allowed'
                      : plan.highlight
                        ? 'bg-brand-accent hover:bg-brand-accent-hover text-white border-brand-border-button neo-shadow'
                        : 'border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary'
                  }`}
                >
                  {isUpgrading === plan.id ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Processing...</>
                  ) : plan.current ? (
                    plan.cta
                  ) : (
                    <>{plan.cta} <ArrowUpRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Current billing summary */}
        <div className="lg:col-span-4 space-y-4 sticky top-6">

          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
              Billing Summary
            </span>

            <div className="space-y-3 font-mono text-2xs">
              <div className="flex justify-between items-baseline">
                <span className="text-text-muted">Plan</span>
                <strong className="text-text-primary">Free</strong>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-text-muted">Billing cycle</span>
                <strong className="text-text-primary">Monthly</strong>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-text-muted">Next renewal</span>
                <strong className="text-text-primary">2026-07-01</strong>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-text-muted">Amount due</span>
                <strong className="text-brand-secondary">$0.00</strong>
              </div>
            </div>

            {/* Usage bars */}
            <div className="pt-3 border-t border-brand-border space-y-3">
              <span className="text-[9px] font-mono font-bold text-text-muted uppercase tracking-wider block">
                Current Usage
              </span>
              {[
                { label: 'API Requests', used: 128450, limit: 500000, unit: 'req' },
                { label: 'CDN Bandwidth', used: 4.8, limit: 50, unit: 'GB' },
                { label: 'Storage', used: 6.3, limit: 1024, unit: 'MB' },
              ].map(meter => {
                const pct = (meter.used / meter.limit) * 100;
                const overHalf = pct > 75;
                return (
                  <div key={meter.label} className="space-y-1">
                    <div className="flex justify-between text-[9.5px] font-mono">
                      <span className="text-text-secondary font-bold">{meter.label}</span>
                      <span className={`font-bold ${overHalf ? 'text-amber-500' : 'text-text-muted'}`}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${overHalf ? 'bg-amber-500' : 'bg-brand-secondary'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

      {/* Payment method + Invoice history */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Payment method */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-brand-secondary" />
            Payment Method
          </span>

          <div className="bg-brand-surface-soft border border-brand-border rounded-xl p-4 text-center space-y-2">
            <CreditCard className="w-8 h-8 text-text-muted mx-auto" />
            <p className="text-2xs font-mono text-text-secondary font-medium">No payment method on file</p>
            <p className="text-[10px] font-mono text-text-muted leading-relaxed">
              Add a card when upgrading to Pro or Team.
            </p>
          </div>

          <button
            disabled
            className="w-full inline-flex items-center justify-center gap-1.5 border border-brand-border text-text-muted font-mono font-bold text-2xs py-2.5 rounded-lg cursor-not-allowed opacity-50"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Add Payment Method
          </button>

          <p className="text-[10px] font-mono text-text-muted text-center">
            Payments processed securely via Stripe. Card details are never stored on Wriven servers.
          </p>
        </div>

        {/* Invoice history */}
        <div className="lg:col-span-7 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Invoice History
          </span>

          <div className="divide-y divide-brand-border" id="invoice-list">
            {invoices.map(inv => (
              <div key={inv.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-2xs font-mono font-bold text-text-primary truncate">{inv.description}</p>
                  <p className="text-[9.5px] font-mono text-text-muted">{inv.date}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-2xs font-mono font-bold text-text-primary">{inv.amount}</span>
                  <span className={`text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded border ${
                    inv.status === 'Paid'
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {inv.status}
                  </span>
                  <button
                    className="p-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-muted hover:text-text-primary rounded cursor-pointer transition-colors"
                    title="Download invoice"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {invoices.length === 0 && (
            <div className="text-center py-6 font-mono text-2xs text-text-muted">
              No invoices yet.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
