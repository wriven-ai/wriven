'use client';

import React, { useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Paperclip, RefreshCw, X } from 'lucide-react';
import { ApiRequestError, supportApi, uploadSupportAttachment } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { SupportScope } from '@/lib/types';
import { projectApi } from '@/lib/api';

const SCOPE_OPTIONS: Array<{ value: SupportScope; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'project', label: 'Project' },
  { value: 'billing', label: 'Billing' },
  { value: 'account', label: 'Account' },
  { value: 'technical', label: 'Technical' },
];

interface AttachmentEntry {
  file: File;
  preview: string;
  key?: string;
  uploading: boolean;
  error?: string;
}

export default function NewTicketPage() {
  const { wsSlug } = useParams<{ wsSlug: string }>();
  const router = useRouter();
  const { currentWorkspaceId } = useAuth();

  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<SupportScope>('general');
  const [scopeProjectId, setScopeProjectId] = useState('');
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useQuery({
    queryKey: ['workspace-projects', currentWorkspaceId],
    queryFn: () => projectApi.list(currentWorkspaceId!),
    enabled: !!currentWorkspaceId && scope === 'project',
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const keys = attachments.map((a) => a.key).filter(Boolean) as string[];
      return supportApi.create({
        subject: subject.trim(),
        description: description.trim(),
        scopeType: scope,
        scopeProjectId: scope === 'project' && scopeProjectId ? scopeProjectId : undefined,
        attachmentKeys: keys.length > 0 ? keys : undefined,
      });
    },
    onSuccess: (ticket) => {
      router.push(`/w/${wsSlug}/support/${ticket.id}`);
    },
    onError: (err) => {
      setError(
        err instanceof ApiRequestError ? err.message : 'Failed to create ticket.',
      );
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

  const canSubmit =
    subject.trim().length >= 3 &&
    description.trim().length >= 1 &&
    (scope !== 'project' || !!scopeProjectId) &&
    attachments.every((a) => !a.uploading && !a.error) &&
    !createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="space-y-8 text-left max-w-2xl" id="support-new">
      <div className="border-b border-brand-border pb-5">
        <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
          Open <span className="font-normal italic text-brand-secondary">Support Ticket</span>
        </h1>
        <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
          {`// Describe your issue and we'll respond as soon as possible`}
        </p>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error text-2xs font-mono rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Subject */}
        <div>
          <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="subject">
            Subject <span className="text-status-error">*</span>
          </label>
          <input
            id="subject"
            type="text"
            placeholder="Brief summary of your issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            minLength={3}
            maxLength={160}
            required
            className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent"
          />
          <p className="text-[9px] font-mono text-text-muted mt-1">{subject.length}/160</p>
        </div>

        {/* Scope */}
        <div>
          <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="scope">
            Category
          </label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as SupportScope);
              setScopeProjectId('');
            }}
            className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-hidden cursor-pointer"
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project picker (scope=project) */}
        {scope === 'project' && (
          <div>
            <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="project">
              Project <span className="text-status-error">*</span>
            </label>
            <select
              id="project"
              value={scopeProjectId}
              onChange={(e) => setScopeProjectId(e.target.value)}
              required
              className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-hidden cursor-pointer"
            >
              <option value="">Select a project…</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="description">
            Description <span className="text-status-error">*</span>
          </label>
          <textarea
            id="description"
            placeholder="Describe your issue in detail — what happened, what you expected, steps to reproduce…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={5000}
            required
            className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent resize-y min-h-[120px]"
          />
          <p className="text-[9px] font-mono text-text-muted mt-1">{description.length}/5000</p>
        </div>

        {/* Attachments */}
        <div>
          <label className="block text-2xs font-mono text-text-secondary mb-1.5">
            Attachments <span className="text-text-muted">(images only, ≤3, ≤5 MB each)</span>
          </label>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-3">
              {attachments.map((a, idx) => (
                <div
                  key={idx}
                  className="relative w-20 h-20 rounded-lg border border-brand-border overflow-hidden bg-brand-surface-soft"
                >
                  <img
                    src={a.preview}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {a.uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                  {a.error && (
                    <div className="absolute inset-0 bg-status-error/80 flex items-center justify-center p-1">
                      <p className="font-mono text-[8px] text-white text-center leading-tight">{a.error}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute top-1 right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

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
                className="inline-flex items-center gap-1.5 text-2xs font-mono text-text-secondary border border-brand-border rounded-lg px-3 py-2 hover:border-brand-accent/50 hover:text-text-primary cursor-pointer transition-colors"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Add image ({3 - attachments.length} remaining)
              </button>
            </>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white font-mono font-bold text-2xs py-3 px-6 rounded-lg transition-all border border-brand-border-button disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {createMutation.isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Opening ticket…
              </>
            ) : (
              <>
                <Paperclip className="w-3.5 h-3.5" />
                Open ticket
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-2xs font-mono text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
