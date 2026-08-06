'use client';

import React from 'react';
import { AlertCircle, Database, Globe, RefreshCw } from 'lucide-react';
import { useUsage } from '@/hooks/use-usage';
import type { UsageView } from '@/lib/types';
import { WorkspaceStatsGrid } from '@/components/workspace/workspace-stats-grid';

export default function UsageStatsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useUsage();

  return (
    <div className="space-y-8 text-left" id="usage-stats-workspace">
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Usage &{' '}
            <span className="font-normal italic text-brand-secondary">
              Consumption
            </span>
          </h1>
          <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {'// Current billing-period usage against your plan limits'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 border border-brand-border hover:bg-brand-surface-soft text-text-primary px-3 py-1.5 rounded-lg text-sm font-mono font-bold transition-all cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-brand-accent' : ''}`}
          />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <UsageSkeleton />
      ) : isError ? (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 flex items-center gap-3 text-text-muted">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm font-mono">
            Couldn&apos;t load usage. Try refreshing.
          </span>
        </div>
      ) : data ? (
        <UsageBody data={data} />
      ) : null}

      {/* Workspace aggregate stats (specs/17). Loads independently. */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-mono font-bold tracking-wider text-text-muted uppercase">
          Workspace Stats
        </h2>
        <WorkspaceStatsGrid />
      </div>
    </div>
  );
}

function UsageBody({ data }: { data: UsageView }) {
  const periodLabel = fmtPeriod(data.period.start, data.period.end);
  return (
    <>
      <p className="text-sm font-mono text-text-muted -mt-4">
        Billing period: <span className="text-text-secondary">{periodLabel}</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UsageCard
          icon={<Globe className="w-4 h-4 text-brand-secondary" />}
          label="API Requests"
          sublabel="Delivery API requests this period"
          used={data.requests.used}
          limit={data.requests.limit}
          fmt={fmtCount}
        />
        <UsageCard
          icon={<Database className="w-4 h-4 text-brand-accent" />}
          label="Storage"
          sublabel="Media stored across all projects"
          used={data.storage.usedMb}
          limit={data.storage.limitMb}
          fmt={fmtMb}
        />
      </div>
    </>
  );
}

function UsageCard({
  icon,
  label,
  sublabel,
  used,
  limit,
  fmt,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  used: number;
  limit: number | null;
  fmt: (n: number) => string;
}) {
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const nearLimit = !unlimited && pct >= 80;
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left shadow-xs space-y-3">
      <div className="flex justify-between items-center text-text-muted">
        <span className="text-sm font-mono font-bold tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <div className="flex items-baseline gap-1.5">
        <h2 className="text-2xl font-display font-bold text-text-primary tracking-tight leading-none">
          {fmt(used)}
        </h2>
        <span className="text-sm font-mono text-text-muted leading-none">
          / {unlimited ? 'Unlimited' : fmt(limit as number)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-brand-surface-soft border border-brand-border rounded-full overflow-hidden">
        <div
          className={`h-full ${nearLimit ? 'bg-amber-500' : 'bg-brand-secondary'}`}
          style={{ width: `${unlimited ? 100 : pct}%` }}
        />
      </div>
      <p className="text-sm font-mono text-text-muted">{sublabel}</p>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="bg-brand-surface border border-brand-border rounded-xl p-5 h-32 animate-pulse"
        />
      ))}
    </div>
  );
}

// ── formatters ──────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function fmtPeriod(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  };
  const s = new Date(startIso).toLocaleDateString(undefined, opts);
  const e = new Date(endIso).toLocaleDateString(undefined, opts);
  return `${s} – ${e} (UTC)`;
}
