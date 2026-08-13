'use client';

import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, Camera, CircleAlert, Loader2, Mail, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, authApi, uploadAvatar } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { UserAvatar } from '@/components/ui/user-avatar';
import { toast } from 'sonner';

const inputCls =
  'w-full rounded-lg border border-brand-border bg-brand-surface-soft px-3.5 py-2.5 font-mono text-sm text-text-primary focus:border-brand-accent focus:outline-none disabled:opacity-60';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const nameMutation = useMutation({
    mutationFn: (newName: string) => authApi.updateProfile({ name: newName }),
    onSuccess: (updated) => {
      updateUser(updated);
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) =>
      setError(e instanceof ApiRequestError ? e.message : 'Update failed.'),
  });

  // A `null` file clears the photo; a File uploads to R2 then stores the key.
  const photoMutation = useMutation({
    mutationFn: async (file: File | null) =>
      file
        ? authApi.updateProfile({ avatar: await uploadAvatar(file) })
        : authApi.updateProfile({ avatar: null }),
    onSuccess: (updated) => {
      updateUser(updated);
      setError(null);
    },
    onError: (e) =>
      setError(e instanceof ApiRequestError ? e.message : 'Photo update failed.'),
  });

  // On-demand email verification (specs/18) — signup no longer auto-sends.
  const resendMutation = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () =>
      toast.success('Verification email sent — check your inbox.'),
    onError: (e) =>
      setError(e instanceof ApiRequestError ? e.message : 'Could not send verification email.'),
  });

  if (!user) {
    return <p className="font-mono text-sm text-text-muted">Loading…</p>;
  }

  const dirty = name.trim() !== user.name;
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) photoMutation.mutate(file);
    e.target.value = ''; // allow re-picking the same file
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">
          Profile
        </h1>
        <p className="mt-1 font-mono text-sm text-text-muted">
          Manage your display name and profile photo.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-status-error/40 bg-status-error/5 px-4 py-3 font-mono text-sm text-status-error">
          {error}
        </div>
      )}

      {/* Profile photo + display name — one card, compact photo actions */}
      <form
        className="space-y-5 rounded-xl border border-brand-border bg-brand-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) nameMutation.mutate(name.trim());
        }}
      >
        <h2 className="font-mono text-sm font-bold text-text-primary">Profile</h2>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* Avatar + photo actions */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <UserAvatar
                name={user.name}
                src={user.avatar}
                size={64}
                className="rounded-full"
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPick}
              />
              {/* Compact camera badge — change photo on click */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoMutation.isPending}
                title="Change photo"
                aria-label="Change photo"
                className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-brand-accent text-white shadow-sm ring-2 ring-brand-surface transition-all hover:bg-brand-accent-hover hover:scale-110 active:scale-95 disabled:opacity-60"
              >
                {photoMutation.isPending && photoMutation.variables ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Camera className="size-3" />
                )}
              </button>
            </div>
            {/* Small muted link, only when a photo exists */}
            {user.avatar && (
              <button
                type="button"
                onClick={() => photoMutation.mutate(null)}
                disabled={photoMutation.isPending}
                title="Remove photo"
                className="inline-flex items-center gap-1 font-mono text-xs text-text-muted transition-colors hover:text-status-error disabled:opacity-50"
              >
                <Trash2 className="size-3" />
                Remove photo
              </button>
            )}
          </div>

          {/* Display name */}
          <label className="block flex-1 space-y-1.5">
            <span className="font-mono text-xs text-text-muted">Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              maxLength={80}
              placeholder="Your name"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={nameMutation.isPending || !dirty}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 font-mono text-sm font-bold text-white transition-all hover:bg-brand-accent-hover disabled:opacity-60"
          >
            {nameMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {nameMutation.isPending
              ? 'Saving…'
              : saved
                ? 'Saved'
                : 'Save changes'}
          </button>
        </div>
      </form>

      {/* Email (read-only) + verification status */}
      <section className="space-y-4 rounded-xl border border-brand-border bg-brand-surface p-6">
        <h2 className="font-mono text-sm font-bold text-text-primary">Email</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="size-4 shrink-0 text-text-muted" />
            <span className="font-mono text-sm text-text-primary truncate">
              {user.email}
            </span>
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 rounded border border-status-success/40 bg-status-success/10 px-1.5 py-0.5 text-xs font-bold font-mono uppercase text-status-success">
                <BadgeCheck className="size-3" /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-status-error/40 bg-status-error/10 px-1.5 py-0.5 text-xs font-bold font-mono uppercase text-status-error">
                <CircleAlert className="size-3" /> Unverified
              </span>
            )}
          </div>
          {!user.emailVerified && (
            <button
              type="button"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 font-mono text-sm font-bold text-white transition-all hover:bg-brand-accent-hover disabled:opacity-60"
            >
              {resendMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Mail className="size-3.5" />
              )}
              {resendMutation.isPending ? 'Sending…' : 'Verify email'}
            </button>
          )}
        </div>
        <p className="font-mono text-xs text-text-muted">
          {user.emailVerified
            ? 'Your email is verified.'
            : 'Verify your email to secure your account. We’ll send a verification link.'}
        </p>
      </section>
    </div>
  );
}
