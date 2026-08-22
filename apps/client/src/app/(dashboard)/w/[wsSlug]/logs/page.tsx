'use client';

import React, { useMemo, useState } from 'react';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useCurrentWorkspace } from '@/hooks/use-current-workspace';
import { useWorkspaceLogs } from '@/hooks/use-workspace-logs';
import { useAuthStore } from '@/stores/auth';
import { LogRow } from '@/components/logs/log-row';
import { Pagination } from '@/components/ui/pagination';
import {
  WORKSPACE_LOG_WINDOWS,
  type WorkspaceLogWindow,
} from '@/lib/types';

const DEFAULT_WINDOW: WorkspaceLogWindow = 30;

export default function WorkspaceLogsPage() {
  // useSearchParams requires a Suspense boundary under static rendering.
  return (
    <Suspense fallback={<LogsSkeleton />}>
      <LogsPageBody />
    </Suspense>
  );
}

function LogsPageBody() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const workspace = useCurrentWorkspace();
  const daysParam = Number(searchParams.get('days'));
  const days: WorkspaceLogWindow = (WORKSPACE_LOG_WINDOWS as readonly number[]).includes(
    daysParam,
  )
    ? (daysParam as WorkspaceLogWindow)
    : DEFAULT_WINDOW;
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch, isFetching } = useWorkspaceLogs(
    workspace?.id ?? null,
    days,
    page,
  );

  const setDays = (next: WorkspaceLogWindow) => {
    setPage(1);
    router.replace(`${pathname}?days=${next}`, { scroll: false });
  };

  // Resolve project names from the loaded session; fall back to a short id.
  const projects = useAuthStore((s) => s.projects);
  const projectName = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p.name]));
    return (projectId: string | null) =>
      projectId ? (byId.get(projectId) ?? projectId.slice(0, 8)) : null;
  }, [projects]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-6 text-left" id="workspace-logs">
      {/* Page header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Activity{' '}
            <span className="font-normal italic text-brand-secondary">Log</span>
          </h1>
          <p className="text-sm font-mono text-text-muted mt-1 leading-relaxed">
            {'// Who did what across this workspace'}
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

      {/* Window filter */}
      <div className="flex items-center gap-2">
        {WORKSPACE_LOG_WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setDays(w)}
            className={`px-3 py-1.5 rounded-lg text-sm font-mono font-bold border transition-all cursor-pointer ${
              w === days
                ? 'bg-brand-surface-soft text-text-primary border-brand-accent'
                : 'text-text-muted border-brand-border hover:text-text-primary'
            }`}
          >
            Last {w} days
          </button>
        ))}
      </div>

      {/* Feed */}
      {isLoading ? (
        <LogsSkeleton />
      ) : isError ? (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 flex items-center gap-3 text-text-muted">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-sm font-mono">
            Couldn&apos;t load the activity log. Try refreshing.
          </span>
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-4">
          <div
            className={`bg-brand-surface border border-brand-border rounded-xl divide-y divide-brand-border overflow-hidden transition-opacity ${isFetching ? 'opacity-60' : ''}`}
          >
            {data.items.map((log) => (
              <LogRow key={log.id} log={log} projectName={projectName} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      ) : (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-8 text-center">
          <p className="text-sm font-mono text-text-muted">
            No activity in the last {days} days.
          </p>
        </div>
      )}
    </div>
  );
}

function LogsSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl divide-y divide-brand-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 flex items-start gap-3.5">
          <div className="h-8 w-8 rounded-full bg-brand-surface-soft animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-28 rounded bg-brand-surface-soft animate-pulse" />
              <div className="h-3 w-40 rounded bg-brand-surface-soft animate-pulse" />
            </div>
            <div className="h-3.5 w-56 rounded bg-brand-surface-soft animate-pulse" />
          </div>
          <div className="h-3.5 w-20 rounded bg-brand-surface-soft animate-pulse mt-1" />
        </div>
      ))}
    </div>
  );
}
