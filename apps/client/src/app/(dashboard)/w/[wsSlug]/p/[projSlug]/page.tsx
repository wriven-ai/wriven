'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Boxes,
  FileText,
  Image as ImageIcon,
  KeyRound,
  ArrowUpRight,
  Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavContext } from '@/components/sidebar/use-nav-context';
import { useProjectStats } from '@/hooks/use-project-stats';
import { ProjectStatsSkeleton } from '@/components/skeleton/workspace-stats-skeleton';

type StatCard = {
  name: string;
  value: string;
  sub?: string;
  Icon: LucideIcon;
};

export default function DashboardHome() {
  const { data } = useNavContext();
  const pBase =
    data.workspace && data.project
      ? `/w/${data.workspace.slug}/p/${data.project.slug}`
      : '';
  const { data: stats, isError } = useProjectStats();

  const cards: StatCard[] = stats
    ? [
        {
          name: 'Entries',
          value: stats.entries.total.toLocaleString(),
          sub: `${stats.entries.published.toLocaleString()} published · ${stats.entries.draft.toLocaleString()} draft`,
          Icon: FileText,
        },
        {
          name: 'Content Types',
          value: stats.contentTypes.toLocaleString(),
          Icon: Boxes,
        },
        {
          name: 'Media',
          value: `${stats.media.count.toLocaleString()} files`,
          sub: `${stats.media.usedMb.toLocaleString()} MB`,
          Icon: ImageIcon,
        },
        {
          name: 'API Keys',
          value: stats.apiKeys.toLocaleString(),
          Icon: KeyRound,
        },
        {
          name: 'Webhooks',
          value: stats.webhooks.toLocaleString(),
          Icon: Webhook,
        },
      ]
    : [];

  return (
    <div className="space-y-8 text-left" id="dashboard-home">
      {/* Real project stats (specs/17 — replaces prior hardcoded numbers). */}
      {isError ? (
        <p className="font-mono text-2xs text-text-muted">
          Couldn’t load project stats right now.
        </p>
      ) : !stats ? (
        <ProjectStatsSkeleton cards={5} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats-grid">
          {cards.map((card, idx) => (
            <motion.div
              key={card.name}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs relative text-left"
              id={`stat-box-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono font-bold text-text-muted uppercase tracking-wider">
                  {card.name}
                </span>
                <div className="p-1.5 rounded-lg border border-brand-border/25 bg-brand-accent/10 text-brand-accent">
                  <card.Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="font-display font-bold text-2xl text-text-primary tracking-tight">
                  {card.value}
                </span>
                {card.sub ? (
                  <p className="text-sm font-mono text-text-muted mt-1">
                    {card.sub}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Quick Launchpad Buttons (Cards) */}
      <div className="space-y-3 text-left">
        <h2 className="text-sm font-mono font-bold text-text-muted tracking-wider px-1">
          Quick Engine Shortcuts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="shortcuts-grid">
          {[
            {
              title: 'Create Schema Model',
              desc: 'Declare fields, types, relationships',
              link: `${pBase}/content-types`,
              label: 'Launch Modeler',
            },
            {
              title: 'Weave Creative Copy',
              desc: 'AI-assisted structured content writer',
              link: `${pBase}/content`,
              label: 'Open Editor',
            },
            {
              title: 'Compile Graphic Assets',
              desc: 'AI graphic generation & search',
              link: `${pBase}/media`,
              label: 'Open Library',
            },
          ].map((item, i) => (
            <Link
              key={i}
              href={item.link}
              className="group bg-brand-surface hover:bg-brand-surface-soft/40 border border-brand-border hover:border-brand-accent rounded-xl p-5 shadow-xs transition-colors flex flex-col justify-between min-h-[140px] text-left"
            >
              <div className="space-y-1.5">
                <span className="text-sm font-mono text-brand-secondary font-bold block">
                  Shortcut 0{i + 1}
                </span>
                <h3 className="font-display font-medium text-sm text-text-primary group-hover:text-brand-accent transition-colors tracking-tight">
                  {item.title}
                </h3>
                <p className="text-sm text-text-secondary leading-snug font-light">
                  {item.desc}
                </p>
              </div>
              <span className="text-sm font-mono font-bold text-text-primary group-hover:text-brand-accent transition-colors flex items-center gap-1.5 mt-4">
                {item.label}{' '}
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
