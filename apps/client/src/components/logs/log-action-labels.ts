import type { WorkspaceLogAction } from '@/lib/types';

/** Visual grouping for the feed — drives the badge tone in the logs page. */
export type LogActionKind =
  | 'workspace'
  | 'members'
  | 'project'
  | 'content'
  | 'media'
  | 'integration'
  | 'billing';

interface LogActionMeta {
  /** Human sentence fragment, rendered as "<Actor> <label>". */
  label: string;
  kind: LogActionKind;
}

/** Mirrors WORKSPACE_LOG_ACTIONS from @wriven/contracts — keep both in sync. */
const LOG_ACTION_META: Record<WorkspaceLogAction, LogActionMeta> = {
  'workspace.update': { label: 'updated workspace settings', kind: 'workspace' },
  'member.add': { label: 'added a member', kind: 'members' },
  'member.update': { label: 'changed a member role', kind: 'members' },
  'member.remove': { label: 'removed a member', kind: 'members' },
  'invitation.create': { label: 'sent an invitation', kind: 'members' },
  'invitation.revoke': { label: 'revoked an invitation', kind: 'members' },
  'project.create': { label: 'created a project', kind: 'project' },
  'project.update': { label: 'updated a project', kind: 'project' },
  'project.delete': { label: 'deleted a project', kind: 'project' },
  'billing.swap': { label: 'changed the subscription plan', kind: 'billing' },
  'contentType.create': { label: 'created a content type', kind: 'content' },
  'contentType.update': { label: 'updated a content type', kind: 'content' },
  'contentType.delete': { label: 'deleted a content type', kind: 'content' },
  'entry.create': { label: 'created an entry', kind: 'content' },
  'entry.update': { label: 'updated an entry', kind: 'content' },
  'entry.delete': { label: 'deleted an entry', kind: 'content' },
  'entry.publish': { label: 'published an entry', kind: 'content' },
  'entry.restore': { label: 'restored an entry revision', kind: 'content' },
  'media.upload': { label: 'uploaded media', kind: 'media' },
  'media.delete': { label: 'deleted media', kind: 'media' },
  'apiKey.create': { label: 'created an API key', kind: 'integration' },
  'apiKey.regenerate': { label: 'regenerated an API key', kind: 'integration' },
  'apiKey.revoke': { label: 'revoked an API key', kind: 'integration' },
  'webhook.create': { label: 'created a webhook', kind: 'integration' },
  'webhook.update': { label: 'updated a webhook', kind: 'integration' },
  'webhook.delete': { label: 'deleted a webhook', kind: 'integration' },
};

export function logActionMeta(action: WorkspaceLogAction): LogActionMeta {
  return LOG_ACTION_META[action];
}

/** Badge tone classes per kind — matches the dashboard's muted palette. */
export const LOG_KIND_TONE: Record<LogActionKind, string> = {
  workspace: 'text-text-secondary border-brand-border',
  members: 'text-brand-secondary border-brand-border',
  project: 'text-brand-accent border-brand-border',
  content: 'text-brand-secondary border-brand-border',
  media: 'text-brand-accent border-brand-border',
  integration: 'text-text-secondary border-brand-border',
  billing: 'text-brand-accent border-brand-border',
};
