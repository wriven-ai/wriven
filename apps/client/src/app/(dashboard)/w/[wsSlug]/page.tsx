'use client';

import Link from 'next/link';
import { ArrowUpRight, FolderKanban, Settings, Users } from 'lucide-react';
import { useNavContext } from '@/components/sidebar/use-nav-context';

/** Workspace overview — landing page for a workspace scope. */
export default function WorkspaceOverview() {
  const { data } = useNavContext();
  const ws = data.workspace;
  const base = ws ? `/w/${ws.slug}` : '#';

  const cards = [
    {
      href: `${base}/projects`,
      label: 'Projects',
      desc: `${data.projects.length} in this workspace`,
      icon: FolderKanban,
    },
    { href: `${base}/members`, label: 'Members', desc: 'Manage access', icon: Users },
    { href: `${base}/settings`, label: 'Settings', desc: 'Workspace config', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black text-text-primary">
          {ws?.name ?? 'Workspace'}
        </h1>
        <p className="text-2xs font-mono text-text-muted uppercase tracking-wider">
          Workspace overview
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="group flex items-start justify-between gap-3 rounded-xl border border-brand-border bg-brand-surface p-4 hover:border-brand-accent transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-brand-accent/10 p-2 text-brand-accent">
                <c.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-mono text-xs font-bold text-text-primary">
                  {c.label}
                </p>
                <p className="text-[10px] font-mono text-text-muted">{c.desc}</p>
              </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-text-muted group-hover:text-brand-accent" />
          </Link>
        ))}
      </div>
    </div>
  );
}
