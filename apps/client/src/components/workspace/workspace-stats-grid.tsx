'use client';

import {
  Boxes,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWorkspaceStats } from '@/hooks/use-workspace-stats';
import { WorkspaceStatsSkeleton } from '@/components/skeleton/workspace-stats-skeleton';

/**
 * Workspace-level stat cards (specs/17). Read-only aggregate over the active
 * workspace: projects, members, entries (+ published split), content types,
 * API keys, webhooks, media, and API requests vs plan limit. Unmetered
 * dimensions (bandwidth, AI text/image) surface as a muted footer note rather
 * than fake numbers.
 */
export function WorkspaceStatsGrid() {
  const { data, isError } = useWorkspaceStats();

  if (isError) {
    return (
      <p className="font-mono text-2xs text-text-muted">
        Couldn’t load workspace stats right now.
      </p>
    );
  }
  // Loading OR disabled (workspace id not resolved yet) → skeleton.
  if (!data) return <WorkspaceStatsSkeleton />;

  const cards: {
    label: string;
    value: string;
    sub?: string;
    Icon: LucideIcon;
  }[] = [
    {
      label: 'Projects',
      value: data.projects.toLocaleString(),
      Icon: Layers,
    },
    {
      label: 'Members',
      value: data.members.toLocaleString(),
      Icon: Users,
    },
    {
      label: 'Entries',
      value: data.entries.total.toLocaleString(),
      sub: `${data.entries.published.toLocaleString()} published`,
      Icon: FileText,
    },
    {
      label: 'Content Types',
      value: data.contentTypes.toLocaleString(),
      Icon: Boxes,
    },
    {
      label: 'API Keys',
      value: data.apiKeys.toLocaleString(),
      Icon: KeyRound,
    },
    {
      label: 'Webhooks',
      value: data.webhooks.toLocaleString(),
      Icon: Webhook,
    },
    {
      label: 'Media',
      value: `${data.media.count.toLocaleString()} files`,
      sub: `${data.media.usedMb.toLocaleString()} MB${
        data.media.limitMb ? ` / ${data.media.limitMb.toLocaleString()} MB` : ''
      }`,
      Icon: ImageIcon,
    },
    {
      label: 'API Requests',
      value: data.apiRequests.used.toLocaleString(),
      sub:
        data.apiRequests.limit == null
          ? 'Unlimited'
          : `of ${data.apiRequests.limit.toLocaleString()} / mo`,
      Icon: Zap,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, sub, Icon }) => (
          <div
            key={label}
            className="bg-brand-surface border border-brand-border rounded-xl p-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xs font-mono font-bold uppercase tracking-wider text-text-muted">
                {label}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-secondary/10 text-brand-secondary">
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-3 font-display text-xl font-bold tracking-tight text-text-primary">
              {value}
            </p>
            {sub ? (
              <p className="mt-1 font-mono text-2xs text-text-muted">{sub}</p>
            ) : null}
          </div>
        ))}
      </div>
      {/* Unmetered dimensions — present but not yet reported (specs/17). */}
      <p className="font-mono text-2xs text-text-muted">
        Bandwidth, AI text &amp; image usage — not yet reported.
      </p>
    </div>
  );
}
