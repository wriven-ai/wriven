'use client';

import React, { useMemo, useState } from 'react';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useCurrentWorkspace } from '@/hooks/use-current-workspace';
import { useWorkspaceLogs } from '@/hooks/use-workspace-logs';
import { useAuthStore } from '@/stores/auth';
import {
  LOG_KIND_TONE,
  logActionMeta,
} from '@/components/logs/log-action-labels';
import { Pagination } from '@/components/ui/pagination';
import {
  WORKSPACE_LOG_WINDOWS,
  type WorkspaceLogView,
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
      projectId ? (byId.get(projectId) ?? shortId(projectId)) : null;
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
          <div className="bg-brand-surface border border-brand-border rounded-xl divide-y divide-brand-border overflow-hidden">
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

function LogRow({
  log,
  projectName,
}: {
  log: WorkspaceLogView;
  projectName: (projectId: string | null) => string | null;
}) {
  const meta = logActionMeta(log.action);
  const project = projectName(log.projectId);
  return (
    <div className="flex flex-wrap items-start sm:items-center gap-x-4 gap-y-1.5 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className="text-sm font-bold text-text-primary truncate"
            title={log.userEmail ?? undefined}
          >
            {log.userName ?? 'Removed member'}
          </span>
          <span className="text-sm font-mono text-text-secondary">
            {meta.label}
          </span>
          {log.targetId && (
            <span className="text-xs font-mono text-text-muted">
              {shortId(log.targetId)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider ${LOG_KIND_TONE[meta.kind]}`}
          >
            {meta.kind}
          </span>
          {project && (
            <span className="text-xs font-mono text-text-muted">
              {project}
            </span>
          )}
        </div>
      </div>
      <time
        dateTime={log.createdAt}
        className="text-xs font-mono text-text-muted whitespace-nowrap"
      >
        {fmtDateTime(log.createdAt)}
      </time>
    </div>
  );
}

function LogsSkeleton() {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl divide-y divide-brand-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4">
          <div className="h-4 w-32 rounded bg-brand-surface-soft animate-pulse" />
          <div className="h-4 w-44 rounded bg-brand-surface-soft animate-pulse" />
          <div className="ml-auto h-4 w-20 rounded bg-brand-surface-soft animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

function shortId(id: string): string {
  return id.slice(0, 8);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
