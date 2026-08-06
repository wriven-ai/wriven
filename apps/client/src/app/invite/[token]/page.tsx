'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, MailWarning, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, invitationApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { status, isAuthenticated, user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    data: invite,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => invitationApi.preview(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => invitationApi.accept(token),
    onSuccess: (res) => {
      const path = res.projectSlug
        ? `/w/${res.workspaceSlug}/p/${res.projectSlug}`
        : `/w/${res.workspaceSlug}`;
      // Hard navigation re-bootstraps the session (/auth/me) so the freshly
      // joined workspace/project is in the store — a client push would land on
      // a scope the store doesn't know yet and trigger notFound().
      window.location.assign(path);
    },
    onError: (err) =>
      setError(err instanceof ApiRequestError ? err.message : 'Could not accept.'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md rounded-xl border border-brand-border bg-brand-surface p-6 shadow-xs sm:p-8">
        {isLoading || status === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-10 font-mono text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invitation…
          </div>
        ) : isError || !invite ? (
          <Dead
            title="Invitation unavailable"
            body="This invitation is invalid, expired, or already used. Ask the person who invited you to send a new one."
          />
        ) : (
          <Content
            invite={invite}
            token={token}
            isAuthenticated={isAuthenticated}
            userEmail={user?.email ?? null}
            error={error}
            accepting={acceptMutation.isPending}
            onAccept={() => {
              setError(null);
              acceptMutation.mutate();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Content({
  invite,
  token,
  isAuthenticated,
  userEmail,
  error,
  accepting,
  onAccept,
}: {
  invite: import('@/lib/types').InvitationPreview;
  token: string;
  isAuthenticated: boolean;
  userEmail: string | null;
  error: string | null;
  accepting: boolean;
  onAccept: () => void;
}) {
  const target =
    invite.scope === 'project' ? invite.projectName : invite.workspaceName;
  const inviter = invite.inviterName ?? 'Someone';
  const emailMismatch = isAuthenticated && userEmail !== invite.email;

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-brand-border bg-brand-accent/10 text-brand-accent">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div>
        <h1 className="font-display text-xl font-bold text-text-primary">
          Join {target}
        </h1>
        <p className="mt-1 font-mono text-sm text-text-muted">
          {inviter} invited <span className="text-text-secondary">{invite.email}</span> as{' '}
          <span className="uppercase text-brand-secondary">{invite.role}</span>
        </p>
      </div>

      {error ? (
        <p className="font-mono text-sm text-status-error">{error}</p>
      ) : null}

      {emailMismatch ? (
        <Dead
          inline
          icon={<MailWarning className="h-5 w-5 text-amber-500" />}
          title="Different account"
          body={`You're signed in as ${userEmail}, but this invite is for ${invite.email}. Log out and sign in with that email to accept.`}
        />
      ) : invite.requiresSignup ? (
        <div className="space-y-2">
          <Link
            href={`/register?email=${encodeURIComponent(invite.email)}`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 font-mono text-sm font-bold text-white transition-all hover:bg-brand-accent-hover"
          >
            Create your account
          </Link>
          <p className="font-mono text-sm text-text-muted">
            We&apos;ll add you to {target} as soon as you sign up.
          </p>
        </div>
      ) : !isAuthenticated ? (
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 font-mono text-sm font-bold text-white transition-all hover:bg-brand-accent-hover"
        >
          Log in to accept
        </Link>
      ) : (
        <button
          onClick={onAccept}
          disabled={accepting}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-accent px-4 py-2.5 font-mono text-sm font-bold text-white transition-all hover:bg-brand-accent-hover disabled:opacity-60"
        >
          {accepting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Accept invitation
        </button>
      )}
    </div>
  );
}

function Dead({
  title,
  body,
  inline,
  icon,
}: {
  title: string;
  body: string;
  inline?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={inline ? 'space-y-2' : 'space-y-3 text-center'}>
      {!inline ? (
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-brand-border bg-brand-surface-soft text-text-muted">
          <MailWarning className="h-5 w-5" />
        </div>
      ) : (
        <div className="flex justify-center">{icon}</div>
      )}
      <h1 className="font-display text-base font-bold text-text-primary">{title}</h1>
      <p className="font-mono text-sm leading-relaxed text-text-muted">{body}</p>
    </div>
  );
}
