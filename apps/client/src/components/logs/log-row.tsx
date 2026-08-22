'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { describeLog, logMetaLabel, metaEntries } from './log-describe';
import {
  LOG_KIND_TONE,
  logActionMeta,
  type LogActionKind,
} from './log-action-labels';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { UserAvatar } from '@/components/ui/user-avatar';
import { timeAgo } from '@/lib/utils';
import type { WorkspaceLogView } from '@/lib/types';

/** One activity row: actor identity + detailed sentence, expanding into a
 * metadata detail panel. Rows with nothing to show (no target id, no
 * metadata — e.g. old delete rows) render as a static header. */
export function LogRow({
  log,
  projectName,
}: {
  log: WorkspaceLogView;
  projectName: (projectId: string | null) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const meta = logActionMeta(log.action);
  const project = projectName(log.projectId);
  const details = metaEntries(log.metadata);
  const hasDetail = !!log.targetId || details.length > 0;

  const header = (
    <RowHeader
      log={log}
      kind={meta.kind}
      project={project}
      expandable={hasDetail}
      open={open}
    />
  );

  return (
    <Collapsible open={hasDetail ? open : undefined} onOpenChange={setOpen}>
      {hasDetail ? (
        <CollapsibleTrigger className="block w-full text-left cursor-pointer hover:bg-brand-surface-soft/40 transition-colors">
          {header}
        </CollapsibleTrigger>
      ) : (
        header
      )}
      {hasDetail && (
        <CollapsibleContent>
          <div className="border-t border-brand-border bg-brand-surface-soft/40 px-4 py-4 sm:px-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
              <DetailItem label="Action" value={log.action} />
              {log.targetId && (
                <DetailItem
                  label="Target"
                  value={`${log.targetType ?? '—'} · ${log.targetId}`}
                  copyValue={log.targetId}
                />
              )}
              <DetailItem label="Project" value={project ?? '—'} />
              <DetailItem label="Actor" value={log.userName ?? 'Removed member'} />
              {log.userEmail && <DetailItem label="Actor email" value={log.userEmail} />}
              {log.userId && <DetailItem label="Actor ID" value={log.userId} />}
              <DetailItem
                label="Timestamp"
                value={`${new Date(log.createdAt).toLocaleString()} · ${log.createdAt}`}
              />
              {details.map(([key, value]) => (
                <DetailItem key={key} label={logMetaLabel(key)} value={value} />
              ))}
            </dl>
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// ── row header ───────────────────────────────────────────────────────────────

function RowHeader({
  log,
  kind,
  project,
  expandable,
  open,
}: {
  log: WorkspaceLogView;
  kind: LogActionKind;
  project: string | null;
  expandable: boolean;
  open: boolean;
}) {
  return (
    <div className="flex items-start gap-3.5 p-4 w-full text-left">
      <UserAvatar name={log.userName ?? '?'} size={32} className="rounded-full" />
      <div className="min-w-0 flex-1">
        {/* Actor identity — name + email inline, not a tooltip. */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-mono font-bold text-text-primary truncate max-w-[14rem]">
            {log.userName ?? 'Removed member'}
          </span>
          {log.userEmail && (
            <span
              className="text-xs font-mono text-text-muted truncate max-w-[16rem]"
              title={log.userEmail}
            >
              {log.userEmail}
            </span>
          )}
        </div>
        {/* Action sentence — strong parts carry the target detail. */}
        <p className="mt-1 text-sm font-mono text-text-secondary flex flex-wrap items-baseline gap-x-1">
          {describeLog(log).map((part, i) => (
            <span
              key={i}
              title={part.text}
              className={
                part.strong
                  ? 'font-bold text-text-primary truncate max-w-[16rem] align-bottom'
                  : undefined
              }
            >
              {part.text}
            </span>
          ))}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider ${LOG_KIND_TONE[kind]}`}
          >
            {kind}
          </span>
          {project && (
            <span className="inline-flex items-center rounded-full border border-brand-border bg-brand-surface px-2 py-0.5 text-[11px] font-mono text-text-muted">
              {project}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <time
          dateTime={log.createdAt}
          title={new Date(log.createdAt).toLocaleString()}
          className="text-xs font-mono text-text-secondary whitespace-nowrap"
        >
          {fmtDateTime(log.createdAt)}
        </time>
        <span className="text-[11px] font-mono text-text-muted">
          {timeAgo(log.createdAt)}
        </span>
        {expandable && (
          <ChevronDown
            className={`w-4 h-4 text-text-muted transition-transform mt-0.5 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>
    </div>
  );
}

// ── detail panel ─────────────────────────────────────────────────────────────

function DetailItem({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  /** When set, renders a copy button copying this (full, untruncated) value. */
  copyValue?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-mono font-bold uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-mono text-text-secondary break-all flex items-start gap-1.5">
        <span className="min-w-0 break-all">{value}</span>
        {copyValue && <CopyButton value={copyValue} />}
      </dd>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — no-op.
    }
  };

  return (
    <button
      onClick={copy}
      aria-label="Copy target id"
      className="shrink-0 mt-0.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-brand-accent" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
