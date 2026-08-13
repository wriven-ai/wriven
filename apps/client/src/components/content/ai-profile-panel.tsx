'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Trash2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { aiApi } from '@/lib/api';
import type { AiGlossaryTerm } from '@/lib/types';

/**
 * Per-project AI voice configuration (specs/21): brand voice, glossary, and
 * default language — injected into every generation's system prompt on the
 * server, so the client never has to send it with each generate call.
 *
 * Gated at the route on `CONTENT_TYPE_MANAGE`. Load + edit only; an absent
 * profile simply means "no guidance" (today's neutral behavior).
 */
export function AiProfilePanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-profile'],
    queryFn: aiApi.getProfile,
  });

  const [brandVoice, setBrandVoice] = useState('');
  const [glossary, setGlossary] = useState<AiGlossaryTerm[]>([]);
  const [language, setLanguage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    setBrandVoice(data.brandVoice ?? '');
    setGlossary(data.glossary ?? []);
    setLanguage(data.language ?? '');
    setDirty(false);
  }, [data]);

  const mutation = useMutation({
    mutationFn: aiApi.updateProfile,
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['ai-profile'] });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
        <p className="text-sm font-mono text-text-muted">Loading AI settings…</p>
      </div>
    );
  }

  const addGlossaryRow = () => {
    setGlossary((prev) => [...prev, { term: '', prefer: '' }]);
    setDirty(true);
  };

  const removeGlossaryRow = (index: number) => {
    setGlossary((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-brand-border">
        <Sparkles className="w-4 h-4 text-brand-secondary" />
        <h2 className="text-sm font-mono font-bold tracking-wider text-text-primary">
          AI Voice Settings
        </h2>
        <span className="ml-auto text-xs font-mono text-text-muted">
          Applied to every generation
        </span>
      </div>

      <label className="space-y-1.5 block">
        <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">
          Brand voice
        </span>
        <textarea
          rows={3}
          value={brandVoice}
          disabled={!canManage}
          onChange={(e) => {
            setBrandVoice(e.target.value);
            setDirty(true);
          }}
          placeholder="e.g. Confident, concise, and practical. Address the reader directly."
          className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent resize-y disabled:opacity-60"
        />
      </label>

      <label className="space-y-1.5 block">
        <span className="block text-xs font-mono uppercase tracking-wider text-text-muted">
          Default language <span className="normal-case text-text-muted/70">— optional</span>
        </span>
        <input
          type="text"
          value={language}
          disabled={!canManage}
          maxLength={20}
          onChange={(e) => {
            setLanguage(e.target.value);
            setDirty(true);
          }}
          placeholder="e.g. en, fr, de"
          className="w-full text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-none focus:border-brand-accent disabled:opacity-60"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Glossary <span className="normal-case text-text-muted/70">— preferred terms</span>
          </span>
          {canManage && (
            <button
              type="button"
              onClick={addGlossaryRow}
              disabled={glossary.length >= 50}
              className="inline-flex items-center gap-1 text-xs font-mono font-bold text-brand-secondary hover:text-brand-accent cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
        {glossary.length === 0 ? (
          <p className="text-xs font-mono text-text-muted">
            No glossary terms. The model will use its own defaults.
          </p>
        ) : (
          <div className="space-y-1.5">
            {glossary.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.term}
                  disabled={!canManage}
                  onChange={(e) => {
                    setGlossary((prev) =>
                      prev.map((item, idx) =>
                        idx === i ? { ...item, term: e.target.value } : item,
                      ),
                    );
                    setDirty(true);
                  }}
                  placeholder="avoid"
                  className="flex-1 text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2 text-text-primary focus:outline-none focus:border-brand-accent disabled:opacity-60"
                />
                <span className="text-xs font-mono text-text-muted">→</span>
                <input
                  type="text"
                  value={row.prefer}
                  disabled={!canManage}
                  onChange={(e) => {
                    setGlossary((prev) =>
                      prev.map((item, idx) =>
                        idx === i ? { ...item, prefer: e.target.value } : item,
                      ),
                    );
                    setDirty(true);
                  }}
                  placeholder="use"
                  className="flex-1 text-sm font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2 text-text-primary focus:outline-none focus:border-brand-accent disabled:opacity-60"
                />
                {canManage && (
                  <button
                    type="button"
                    onClick={() => removeGlossaryRow(i)}
                    className="text-text-muted hover:text-status-error cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-brand-border">
          {mutation.isError && (
            <span className="text-xs font-mono text-status-error">
              Failed to save. {(mutation.error as { error?: { message?: string } })?.error?.message ?? ''}
            </span>
          )}
          {mutation.isSuccess && !dirty && (
            <span className="text-xs font-mono text-green-600">Saved.</span>
          )}
          <button
            type="button"
            onClick={() =>
              mutation.mutate({
                brandVoice: brandVoice.trim() || null,
                glossary: glossary.filter((r) => r.term.trim() && r.prefer.trim()),
                language: language.trim() || null,
              })
            }
            disabled={!dirty || mutation.isPending}
            className="ml-auto inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-sm py-2 px-4 rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Saving…' : 'Save voice settings'}
          </button>
        </div>
      )}
    </div>
  );
}
