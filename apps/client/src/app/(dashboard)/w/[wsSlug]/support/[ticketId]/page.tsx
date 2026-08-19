'use client';

import React, { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  ImagePlus,
  Loader2,
  RefreshCw,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError, supportApi, uploadSupportAttachment } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type {
  SupportAttachmentView,
  SupportMessageView,
  SupportScope,
  SupportTicketDetail,
} from '@/lib/types';
import { getStatusColor } from '@/lib/statusColors';
import { timeAgo } from '@/lib/utils';
import {
  TicketDetailSkeleton,
} from '@/components/skeleton/support-skeleton';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';

const SCOPE_LABEL: Record<SupportScope, string> = {
  general: 'General',
  project: 'Project',
  billing: 'Billing',
  account: 'Account',
  technical: 'Technical',
};

interface AttachmentEntry {
  file: File;
  preview: string;
  key?: string;
  uploading: boolean;
  error?: string;
}

function AttachmentThumb({ attachment }: { attachment: SupportAttachmentView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-16 h-16 rounded-lg border border-brand-border overflow-hidden bg-brand-surface-soft cursor-pointer hover:opacity-80 transition-opacity shrink-0"
      >
        <img src={attachment.url} alt={attachment.originalFilename ?? ''} className="w-full h-full object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setOpen(false)}
        >
          <img
            src={attachment.url}
            alt={attachment.originalFilename ?? ''}
            className="max-w-full max-h-full rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function MessageBubble({
  msg,
  currentUserId,
}: {
  msg: SupportMessageView;
  currentUserId: string;
}) {
  const isUser = msg.authorType === 'user';
  const isOwn = isUser && msg.authorId === currentUserId;

  return (
    <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 font-mono font-bold text-sm ${
          isUser
            ? 'bg-brand-accent/15 border-brand-accent/30 text-brand-accent'
            : 'bg-brand-surface border-brand-border text-text-secondary'
        }`}
      >
        {isUser ? 'U' : 'W'}
      </div>

      <div className={`flex flex-col gap-1 max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="font-mono text-sm font-bold text-text-muted">
            {isUser ? (isOwn ? 'You' : 'User') : 'Wriven Support'}
          </span>
          <span className="font-mono text-sm text-text-muted">
            {timeAgo(msg.createdAt)}
          </span>
        </div>
        <div
          className={`rounded-xl px-4 py-3 text-sm font-mono leading-relaxed ${
            isOwn
              ? 'bg-brand-accent text-white rounded-br-sm'
              : 'bg-brand-surface border border-brand-border text-text-primary rounded-bl-sm'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        </div>
        {msg.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {msg.attachments.map((a) => (
              <AttachmentThumb key={a.id} attachment={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TicketDetailPage() {
  return (
    <Suspense fallback={<TicketDetailSkeleton />}>
      <TicketDetailInner />
    </Suspense>
  );
}

function TicketDetailInner() {
  const { wsSlug, ticketId } = useParams<{ wsSlug: string; ticketId: string }>();
  const { currentWorkspaceId, user } = useAuth();
  const queryClient = useQueryClient();

  const [replyBody, setReplyBody] = useState('');
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const queryKey = ['support-ticket', ticketId];

  const { data: ticket, isLoading } = useQuery<SupportTicketDetail>({
    queryKey,
    queryFn: () => supportApi.get(ticketId),
    enabled: !!ticketId && !!currentWorkspaceId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey });

  const replyMutation = useMutation({
    mutationFn: () => {
      const keys = attachments.map((a) => a.key).filter(Boolean) as string[];
      return supportApi.reply(ticketId, {
        body: replyBody.trim(),
        attachmentKeys: keys.length > 0 ? keys : undefined,
      });
    },
    onSuccess: () => {
      setReplyBody('');
      setAttachments([]);
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to send reply.');
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => supportApi.close(ticketId),
    onSuccess: () => {
      setCloseConfirm(false);
      invalidate();
      toast.success('Ticket closed', {
        description: 'This ticket has been marked as closed.',
      });
    },
    onError: (err) => {
      setError(err instanceof ApiRequestError ? err.message : 'Failed to close ticket.');
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const toAdd = Array.from(files).slice(0, 3 - attachments.length);
    if (toAdd.length === 0) return;

    const entries: AttachmentEntry[] = toAdd.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
      uploading: true,
    }));
    setAttachments((prev) => [...prev, ...entries]);

    for (let i = 0; i < toAdd.length; i++) {
      const file = toAdd[i];
      const idx = attachments.length + i;
      try {
        const key = await uploadSupportAttachment(file);
        setAttachments((prev) =>
          prev.map((a, j) => (j === idx ? { ...a, key, uploading: false } : a)),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        setAttachments((prev) =>
          prev.map((a, j) =>
            j === idx ? { ...a, uploading: false, error: msg } : a,
          ),
        );
      }
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
  };

  const isClosed = ticket?.status === 'closed';
  const isAuthor = ticket?.authorId === user?.id;
  const uploadsReady = attachments.every((a) => !a.uploading && !a.error);
  const canReply = !isClosed && replyBody.trim().length > 0 && uploadsReady && !replyMutation.isPending;

  if (isLoading) {
    return <TicketDetailSkeleton />;
  }

  if (!ticket) {
    return (
      <div className="text-center py-16">
        <p className="font-mono text-sm font-bold text-text-primary">Ticket not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-3xl" id="support-detail">
      {/* Back to all tickets */}
      <div>
        <Link
          href={`/w/${wsSlug}/support`}
          className="inline-flex items-center gap-1.5 font-mono text-sm text-text-muted hover:text-brand-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All tickets
        </Link>
      </div>

      {/* Header */}
      <div className="border-b border-brand-border pb-5">
        <div className="flex items-start gap-3 mb-3">
          <span className="font-mono text-sm text-text-muted shrink-0 mt-0.5">
            #{ticket.number}
          </span>
          <h1 className="font-display font-medium text-xl text-text-primary tracking-tight">
            {ticket.subject}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-sm font-mono font-bold uppercase border ${getStatusColor('support', ticket.status)}`}
          >
            {ticket.status}
          </span>
          <span className="px-2 py-0.5 rounded text-sm font-mono font-bold uppercase border border-brand-border bg-brand-surface text-text-muted">
            {SCOPE_LABEL[ticket.scopeType]}
          </span>
          <span className="font-mono text-sm text-text-muted">
            Opened {timeAgo(ticket.createdAt)}
          </span>

          {/* Close action */}
          {isAuthor && !isClosed && (
            <button
              onClick={() => setCloseConfirm(true)}
              className="ml-auto inline-flex items-center gap-1.5 bg-status-error/10 hover:bg-status-error/20 text-status-error font-mono font-bold text-sm py-2 px-3.5 rounded-lg transition-colors border border-status-error/30 cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              Close ticket
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error text-sm font-mono rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Close ticket confirmation dialog */}
      <ConfirmationDialog
        open={closeConfirm}
        onOpenChange={setCloseConfirm}
        title="Close this ticket?"
        description="This ticket will be marked as closed. You won't be able to reply to it after. This action cannot be undone."
        confirmLabel="Close ticket"
        cancelLabel="Keep open"
        variant="danger"
        loading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutate()}
      />

      {/* Conversation thread */}
      <div className="space-y-6">
        {/* Opening post (description) */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-brand-accent/15 border border-brand-accent/30 flex items-center justify-center font-mono font-bold text-sm text-brand-accent">
              U
            </div>
            <span className="font-mono text-sm font-bold text-text-muted">You</span>
            <span className="font-mono text-sm text-text-muted">
              {timeAgo(ticket.createdAt)}
            </span>
          </div>
          <p className="font-mono text-sm text-text-primary whitespace-pre-wrap leading-relaxed break-words">
            {ticket.description}
          </p>
          {ticket.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {ticket.attachments.map((a) => (
                <AttachmentThumb key={a.id} attachment={a} />
              ))}
            </div>
          )}
        </div>

        {/* Replies */}
        {ticket.messages.map((msg: SupportMessageView) => (
          <MessageBubble key={msg.id} msg={msg} currentUserId={user?.id ?? ''} />
        ))}

        {ticket.status === 'resolved' && (
          <div className="flex items-center gap-2 justify-center py-2 text-status-success font-mono text-sm">
            <CheckCircle className="w-4 h-4" />
            Ticket resolved — reply to reopen
          </div>
        )}

        {isClosed && (
          <div className="text-center py-4 font-mono text-sm text-text-muted bg-brand-surface border border-brand-border rounded-xl">
            This ticket is closed.
          </div>
        )}
      </div>

      {/* Reply box */}
      {!isClosed && (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
          <span className="text-sm font-mono font-bold text-text-secondary tracking-wider">
            Reply
          </span>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply…"
            rows={4}
            maxLength={10000}
            className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent resize-y mt-2"
          />

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, idx) => (
                <div
                  key={idx}
                  className="relative w-16 h-16 rounded-lg border border-brand-border overflow-hidden bg-brand-surface-soft"
                >
                  <img src={a.preview} alt="" className="w-full h-full object-cover" />
                  {a.uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    </div>
                  )}
                  {a.error && (
                    <div className="absolute inset-0 bg-status-error/80 flex items-center justify-center p-1">
                      <p className="font-mono text-sm text-white text-center">{a.error}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {attachments.length < 3 && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="p-2.5 text-text-muted hover:text-text-primary hover:bg-brand-surface-soft rounded cursor-pointer transition-colors"
                    title="Attach image"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {attachments.some((a) => a.uploading) && (
                <span className="font-mono text-sm text-text-muted flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setError(null);
                replyMutation.mutate();
              }}
              disabled={!canReply}
              className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-sm py-2.5 px-4 rounded-lg transition-all border border-brand-border-button disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {replyMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Send reply
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
