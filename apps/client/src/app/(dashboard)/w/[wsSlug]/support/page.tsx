'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Circle, LifeBuoy, Plus, RefreshCw } from 'lucide-react';
import { supportApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { SupportScope, SupportStatus, SupportTicketRow } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

const STATUS_STYLE: Record<SupportStatus, string> = {
  open: 'bg-status-warning/15 text-status-warning border-status-warning/30',
  pending: 'bg-brand-surface text-text-secondary border-brand-border',
  resolved: 'bg-status-success/15 text-status-success border-status-success/30',
  closed: 'bg-brand-surface text-text-muted border-brand-border',
};

const SCOPE_LABEL: Record<SupportScope, string> = {
  general: 'General',
  project: 'Project',
  billing: 'Billing',
  account: 'Account',
  technical: 'Technical',
};

const STATUS_FILTERS: Array<{ label: string; value: SupportStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Pending', value: 'pending' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
];

export default function SupportPage() {
  const { wsSlug } = useParams<{ wsSlug: string }>();
  const { currentWorkspaceId } = useAuth();
  const [statusFilter, setStatusFilter] = useState<SupportStatus | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', currentWorkspaceId, statusFilter],
    queryFn: () =>
      supportApi.list(statusFilter !== 'all' ? { status: statusFilter } : undefined),
    enabled: !!currentWorkspaceId,
  });

  const tickets = data?.items ?? [];

  return (
    <div className="space-y-8 text-left" id="support-list">
      <div className="border-b border-brand-border pb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            <span className="font-normal italic text-brand-secondary">Support</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {`// Open a ticket or track your conversations with Wriven support`}
          </p>
        </div>
        <Link
          href={`/w/${wsSlug}/support/new`}
          className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-2xs py-2.5 px-4 rounded-lg transition-colors border border-brand-border-button shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New ticket
        </Link>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold border transition-colors cursor-pointer ${
              statusFilter === f.value
                ? 'bg-brand-accent text-white border-brand-accent'
                : 'bg-brand-surface text-text-secondary border-brand-border hover:border-brand-accent/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-muted font-mono text-2xs py-12 justify-center">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading tickets…
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <LifeBuoy className="w-10 h-10 text-text-muted opacity-40" />
          <div>
            <p className="font-mono font-bold text-sm text-text-primary">No tickets yet</p>
            <p className="font-mono text-2xs text-text-muted mt-1">
              {statusFilter === 'all'
                ? "Need help? Open a support ticket and we'll respond shortly."
                : `No ${statusFilter} tickets.`}
            </p>
          </div>
          {statusFilter === 'all' && (
            <Link
              href={`/w/${wsSlug}/support/new`}
              className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-2xs py-2.5 px-4 rounded-lg transition-colors border border-brand-border-button"
            >
              <Plus className="w-3.5 h-3.5" />
              Open a ticket
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-xs">
          <div className="divide-y divide-brand-border">
            {tickets.map((ticket: SupportTicketRow) => {
              const hasUnread = ticket.lastReplyBy === 'admin';
              return (
                <Link
                  key={ticket.id}
                  href={`/w/${wsSlug}/support/${ticket.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-brand-surface-soft/50 transition-colors group"
                >
                  {/* Unread dot */}
                  <div className="w-2 shrink-0">
                    {hasUnread && (
                      <Circle className="w-2 h-2 fill-brand-accent text-brand-accent" />
                    )}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-text-muted">
                        #{ticket.number}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${STATUS_STYLE[ticket.status]}`}
                      >
                        {ticket.status}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border border-brand-border bg-brand-surface text-text-muted">
                        {SCOPE_LABEL[ticket.scopeType]}
                      </span>
                    </div>
                    <p className="font-mono text-xs font-bold text-text-primary truncate group-hover:text-brand-accent transition-colors">
                      {ticket.subject}
                    </p>
                  </div>

                  {/* Last activity */}
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[10px] text-text-muted">
                      {timeAgo(ticket.lastReplyAt ?? ticket.createdAt)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
