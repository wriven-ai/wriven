import type { WorkspaceLogView } from '@/lib/types';
import { logActionMeta } from './log-action-labels';

/** One segment of a rendered action sentence; strong parts get highlighted. */
export interface LogSentencePart {
  text: string;
  strong?: boolean;
}

/** Human labels for the metadata keys the gateway writes into `req.logMeta`
 * (canonical table: `WorkspaceLogWritePayload.metadata` in @wriven/contracts). */
const LOG_META_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  scope: 'Scope',
  slug: 'Slug',
  version: 'Version',
  apiId: 'API ID',
  filename: 'Filename',
  kind: 'Kind',
  size: 'Size',
  count: 'Count',
  url: 'URL',
  plan: 'Plan',
  cycle: 'Billing cycle',
};

export function logMetaLabel(key: string): string {
  return LOG_META_LABELS[key] ?? key;
}

// ── guarded readers (metadata is jsonb — unknown at runtime) ─────────────────

function str(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Quoted name/title segment, e.g. `"blog"`. */
const quoted = (v: string): LogSentencePart => ({ text: `"${v}"`, strong: true });

/** Bare highlighted segment (emails, roles, hosts, counts). */
const strong = (v: string): LogSentencePart => ({ text: v, strong: true });

/** Join sentence parts (nestable), dropping empty strings. */
function parts(
  ...segments: Array<string | LogSentencePart | LogSentencePart[] | false | null | undefined>
): LogSentencePart[] {
  return segments
    .filter((s): s is string | LogSentencePart | LogSentencePart[] => !!s)
    .flatMap((s) => (typeof s === 'string' ? [{ text: s }] : Array.isArray(s) ? s : [s]));
}

// ── sentence builder ─────────────────────────────────────────────────────────

/** Detailed sentence for a log row; falls back to the generic action label
 * when the row predates metadata enrichment or the key fields are missing. */
export function describeLog(
  log: Pick<WorkspaceLogView, 'action' | 'metadata'>,
): LogSentencePart[] {
  const meta = log.metadata ?? {};
  const fallback = (): LogSentencePart[] => [{ text: logActionMeta(log.action).label }];

  switch (log.action) {
    case 'workspace.update': {
      const name = str(meta, 'name');
      return name ? parts('updated workspace settings — now ', quoted(name)) : fallback();
    }
    case 'member.add':
    case 'member.update': {
      const email = str(meta, 'email');
      const name = str(meta, 'name');
      const who = email ?? name;
      if (!who) return fallback();
      const role = str(meta, 'role');
      return log.action === 'member.add'
        ? parts('added ', strong(who), role ? parts(' as ', strong(role)) : null)
        : parts('updated ', strong(who), role ? parts(' to ', strong(role)) : null);
    }
    case 'invitation.create': {
      const email = str(meta, 'email');
      if (!email) return fallback();
      const role = str(meta, 'role');
      const scope = str(meta, 'scope');
      return parts(
        'invited ',
        strong(email),
        role ? parts(' as ', strong(role)) : null,
        scope ? ` (${scope})` : null,
      );
    }
    case 'project.create':
    case 'project.update': {
      const name = str(meta, 'name');
      if (!name) return fallback();
      return parts(log.action === 'project.create' ? 'created project ' : 'updated project ', quoted(name));
    }
    case 'billing.swap': {
      const plan = str(meta, 'plan');
      if (!plan) return fallback();
      const cycle = str(meta, 'cycle');
      return parts('switched the plan to ', strong(plan), cycle ? ` (${cycle})` : null);
    }
    case 'contentType.create':
    case 'contentType.update': {
      const name = str(meta, 'name');
      if (!name) return fallback();
      const verb = log.action === 'contentType.create' ? 'created' : 'updated';
      const apiId = str(meta, 'apiId');
      return parts(`${verb} content type `, quoted(name), apiId ? parts(' (', strong(apiId), ')') : null);
    }
    case 'entry.create':
    case 'entry.update':
    case 'entry.publish': {
      const slug = str(meta, 'slug');
      if (!slug) return fallback();
      const verb = log.action === 'entry.create' ? 'created' : log.action === 'entry.update' ? 'updated' : 'published';
      return parts(`${verb} entry `, quoted(slug));
    }
    case 'entry.restore': {
      const slug = str(meta, 'slug');
      if (!slug) return fallback();
      const version = num(meta, 'version');
      return parts(
        'restored entry ',
        quoted(slug),
        version != null ? parts(' to version ', strong(`v${version}`)) : null,
      );
    }
    case 'media.upload': {
      const filename = str(meta, 'filename');
      if (!filename) return fallback();
      const kind = str(meta, 'kind');
      const size = num(meta, 'size');
      const extras = [kind, size != null ? formatBytes(size) : null].filter(Boolean).join(', ');
      return parts('uploaded ', quoted(filename), extras ? ` (${extras})` : null);
    }
    case 'media.delete': {
      // Bulk rows carry `count`; single deletes log no metadata.
      const count = num(meta, 'count');
      return count != null ? parts('deleted ', strong(String(count)), ' media files') : fallback();
    }
    case 'apiKey.create':
    case 'apiKey.regenerate': {
      const name = str(meta, 'name');
      if (!name) return fallback();
      const verb = log.action === 'apiKey.create' ? 'created' : 'regenerated';
      return parts(`${verb} API key `, quoted(name));
    }
    case 'webhook.create':
    case 'webhook.update': {
      const url = str(meta, 'url');
      if (!url) return fallback();
      const verb = log.action === 'webhook.create' ? 'created' : 'updated';
      return parts(`${verb} webhook `, strong(hostOf(url)));
    }
    default:
      return fallback();
  }
}

// ── detail-panel entries ─────────────────────────────────────────────────────

/** Printable primitive metadata entries, formatted per key; skips objects. */
export function metaEntries(
  metadata: Record<string, unknown>,
): Array<[key: string, value: string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === 'string') {
      if (value.length > 0) entries.push([key, value]);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push([key, key === 'size' ? formatBytes(value) : key === 'version' ? `v${value}` : String(value)]);
    } else if (typeof value === 'boolean') {
      entries.push([key, value ? 'yes' : 'no']);
    }
  }
  return entries;
}
