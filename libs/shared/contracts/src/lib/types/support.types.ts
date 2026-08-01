export const SUPPORT_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_SCOPES = [
  'general',
  'project',
  'billing',
  'account',
  'technical',
] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export interface SupportAttachmentView {
  id: string;
  url: string;
  mime: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
}

export interface SupportMessageView {
  id: string;
  authorType: 'user' | 'admin';
  authorId: string;
  body: string;
  isInternalNote?: boolean;
  createdAt: string;
  attachments: SupportAttachmentView[];
}

export interface SupportTicketRow {
  id: string;
  number: number;
  subject: string;
  scopeType: SupportScope;
  scopeProjectId: string | null;
  status: SupportStatus;
  priority: SupportPriority;
  lastReplyAt: string | null;
  lastReplyBy: 'user' | 'admin' | null;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketRow {
  workspaceId: string;
  authorId: string;
  description: string;
  attachments: SupportAttachmentView[];
  messages: SupportMessageView[];
}

export interface SupportPresignResult {
  uploadUrl: string;
  key: string;
}

export interface SupportMetrics {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  unassigned: number;
  total: number;
}
