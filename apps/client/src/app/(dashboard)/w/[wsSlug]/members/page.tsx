'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Mail, RefreshCw, Send, Trash2, Users, X } from 'lucide-react';
import { ApiRequestError, invitationApi, memberApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type {
  AssignableWorkspaceRole,
  InvitationView,
  WorkspaceMemberView,
  WorkspaceRole,
} from '@/lib/types';

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
  admin: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  member: 'bg-brand-surface text-text-secondary border-brand-border',
};

export default function MembersPage() {
  const { user, currentWorkspace, currentWorkspaceId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['workspace-members', currentWorkspaceId];

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableWorkspaceRole>('member');
  const [error, setError] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey,
    queryFn: () => memberApi.list(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  const callerRole = members?.find((m) => m.userId === user?.id)?.role;
  const canManage = callerRole === 'owner' || callerRole === 'admin';

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const onError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiRequestError ? err.message : fallback);

  // Inviting a workspace member always creates a pending invitation — the
  // person may not have an account yet, and joining requires their consent.
  const inviteMutation = useMutation({
    mutationFn: (dto: { email: string; role: AssignableWorkspaceRole }) =>
      invitationApi.createWorkspace(currentWorkspaceId!, dto),
    onSuccess: () => {
      invalidateInvites();
      setInviteEmail('');
      setInviteRole('member');
      setError(null);
    },
    onError: (err) => onError(err, 'Failed to send invitation.'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      memberApi.updateRole(currentWorkspaceId!, userId, role),
    onSuccess: invalidate,
    onError: (err) => onError(err, 'Failed to update role.'),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => memberApi.remove(currentWorkspaceId!, userId),
    onSuccess: invalidate,
    onError: (err) => onError(err, 'Failed to remove member.'),
  });

  // Pending invitations.
  const invitesKey = ['workspace-invitations', currentWorkspaceId];
  const { data: invites } = useQuery({
    queryKey: invitesKey,
    queryFn: () => invitationApi.listWorkspace(currentWorkspaceId!),
    enabled: !!currentWorkspaceId && canManage,
  });
  function invalidateInvites() {
    queryClient.invalidateQueries({ queryKey: invitesKey });
  }

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => invitationApi.revoke(id),
    onSuccess: invalidateInvites,
    onError: (err) => onError(err, 'Failed to revoke invitation.'),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => invitationApi.resend(id),
    onSuccess: invalidateInvites,
    onError: (err) => onError(err, 'Failed to resend invitation.'),
  });

  const submitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8 text-left" id="members-workspace">

      {/* Page Header */}
      <div className="border-b border-brand-border pb-5">
        <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
          Workspace <span className="font-normal italic text-brand-secondary">Members</span>
        </h1>
        <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
          {`// Manage who can access ${currentWorkspace?.name ?? 'this workspace'}`}
        </p>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error text-2xs font-mono rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Members + pending invitations */}
        <div className={`${canManage ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6`}>
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary border-b border-brand-border pb-2 mb-1.5 font-bold flex items-center gap-1.5">
            <Users className="w-4 h-4 text-brand-secondary" />
            Members{members ? ` (${members.length})` : ''}
          </span>

          {isLoading ? (
            <div className="flex items-center gap-2 text-text-muted font-mono text-2xs py-6 justify-center">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading members…
            </div>
          ) : !members || members.length === 0 ? (
            <p className="text-text-muted font-mono text-2xs py-6 text-center">
              No members yet.
            </p>
          ) : (
            <div className="space-y-3.5" id="members-rows">
              {members.map((member: WorkspaceMemberView) => {
                const isSelf = member.userId === user?.id;
                const isOwner = member.role === 'owner';
                const editable = canManage && !isOwner && !isSelf;
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 p-3 border border-brand-border bg-brand-surface-soft/40 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/15 border border-brand-border text-brand-accent font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {initials(member.user.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-2xs font-mono font-bold text-text-primary truncate">{member.user.name}</p>
                          {isSelf && (
                            <span className="text-[8px] font-bold px-1.5 py-0.2 rounded uppercase bg-brand-surface text-text-muted border border-brand-border">You</span>
                          )}
                        </div>
                        <p className="text-[9.5px] font-mono text-text-muted select-all truncate">{member.user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {editable ? (
                        <select
                          value={member.role}
                          disabled={roleMutation.isPending}
                          onChange={(e) =>
                            roleMutation.mutate({
                              userId: member.userId,
                              role: e.target.value as WorkspaceRole,
                            })
                          }
                          className="bg-brand-surface border border-brand-border text-text-secondary px-2 py-1 rounded text-[9px] font-mono font-semibold cursor-pointer outline-hidden"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-semibold uppercase border ${ROLE_BADGE[member.role] ?? ROLE_BADGE.member}`}>
                          {member.role}
                        </span>
                      )}
                      {editable && (
                        <button
                          onClick={() => removeMutation.mutate(member.userId)}
                          disabled={removeMutation.isPending}
                          className="p-1 hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors disabled:opacity-40"
                          title="Remove member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

          {canManage && invites && invites.length > 0 ? (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
              <span className="text-[11px] font-mono tracking-wider text-text-secondary flex items-center gap-1.5 border-b border-brand-border pb-2 font-bold">
                <Clock className="w-3.5 h-3.5 text-brand-secondary" />
                Pending invitations ({invites.length})
              </span>
              <ul className="divide-y divide-brand-border">
                {invites.map((inv: InvitationView) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-2xs font-bold text-text-primary">{inv.email}</p>
                      <p className="font-mono text-[9px] text-text-muted uppercase">
                        {inv.role} · invited {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => resendInviteMutation.mutate(inv.id)}
                        disabled={resendInviteMutation.isPending}
                        title="Resend invitation"
                        className="p-1 text-text-muted hover:text-brand-accent rounded cursor-pointer disabled:opacity-40"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => revokeInviteMutation.mutate(inv.id)}
                        disabled={revokeInviteMutation.isPending}
                        title="Revoke invitation"
                        className="p-1 text-text-muted hover:text-status-error rounded cursor-pointer disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Invite member */}
        {canManage && (
          <div className="lg:col-span-5 lg:sticky lg:top-24 bg-brand-surface border border-brand-border rounded-xl p-5 text-left space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2 mb-1 font-bold">
              Invite a member
            </span>

            <form onSubmit={submitInvite} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="invite-email">Email</label>
                  <input
                    id="invite-email"
                    type="email"
                    placeholder="e.g. teammate@wriven.io"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="invite-role">Role</label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as AssignableWorkspaceRole)}
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-hidden cursor-pointer"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={inviteMutation.isPending || !inviteEmail.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all"
              >
                {inviteMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-white" />
                    Send invitation
                  </>
                )}
              </button>
            </form>

            <p className="text-[9.5px] font-mono text-text-muted leading-relaxed">
              We&apos;ll email an invite link. They join after accepting — and
              sign up first if they don&apos;t have an account.
            </p>
          </div>
        )}

      </div>

    </div>
  );
}
