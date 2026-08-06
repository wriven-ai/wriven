'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Circle, LifeBuoy, Plus } from 'lucide-react';
import { supportApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { SupportScope, SupportStatus, SupportTicketRow } from '@/lib/types';
import { getStatusColor } from '@/lib/statusColors';
import { timeAgo } from '@/lib/utils';
import { SupportListSkeleton, TicketListCard } from '@/components/skeleton/support-skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';

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

const PAGE_LIMIT = 10;

export default function SupportPage() {
  return (
    <Suspense fallback={<SupportListSkeleton />}>
      <SupportInner />
    </Suspense>
  );
}

function SupportInner() {
  const { wsSlug } = useParams<{ wsSlug: string }>();
  const { currentWorkspaceId } = useAuth();
  const [statusFilter, setStatusFilter] = useState<SupportStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', currentWorkspaceId, statusFilter, currentPage],
    queryFn: () =>
      supportApi.list({
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        page: currentPage,
        limit: PAGE_LIMIT,
      }),
    enabled: !!currentWorkspaceId,
  });

  const tickets = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const handleStatusChange = (status: SupportStatus | 'all') => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-8 text-left" id="support-list">
      <div className="border-b border-brand-border pb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            <span className="font-normal italic text-brand-secondary">Support</span>
          </h1>
          <p className="text-sm sm:text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {`// Open a ticket or track your conversations with Wriven support`}
          </p>
        </div>
        <Link
          href={`/w/${wsSlug}/support/new`}
          className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-colors border border-brand-border-button shrink-0"
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
            onClick={() => handleStatusChange(f.value)}
            className={`px-3 py-1 rounded-full font-mono text-sm font-bold border transition-colors cursor-pointer ${
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
        <TicketListCard />
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <LifeBuoy className="w-10 h-10 text-text-muted opacity-40" />
          <div>
            <p className="font-mono font-bold text-sm text-text-primary">No tickets yet</p>
            <p className="font-mono text-sm text-text-muted mt-1">
              {statusFilter === 'all'
                ? "Need help? Open a support ticket and we'll respond shortly."
                : `No ${statusFilter} tickets.`}
            </p>
          </div>
          {statusFilter === 'all' && (
            <Link
              href={`/w/${wsSlug}/support/new`}
              className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-colors border border-brand-border-button"
            >
              <Plus className="w-3.5 h-3.5" />
              Open a ticket
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pl-5" />
                <TableHead>Ticket</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right pr-5">Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket: SupportTicketRow) => {
                const hasUnread = ticket.lastReplyBy === 'admin';
                return (
                  <TableRow key={ticket.id} className="group">
                    <TableCell className="pl-5 w-8">
                      {hasUnread && (
                        <Circle className="w-2 h-2 fill-brand-accent text-brand-accent" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/w/${wsSlug}/support/${ticket.id}`}
                        className="block"
                      >
                        <span className="font-mono text-sm text-text-muted">
                          #{ticket.number}
                        </span>
                        <p className="font-mono text-sm font-bold text-text-primary group-hover:text-brand-accent transition-colors">
                          {ticket.subject}
                        </p>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono font-bold uppercase border ${getStatusColor('support', ticket.status)}`}
                      >
                        {ticket.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-bold uppercase border border-brand-border bg-brand-surface text-text-muted">
                        {SCOPE_LABEL[ticket.scopeType]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-5">
                      <span className="font-mono text-sm text-text-muted">
                        {timeAgo(ticket.lastReplyAt ?? ticket.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="px-5">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
