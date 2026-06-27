'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Trash2, Mail, RefreshCw } from 'lucide-react';
import { ApiRequestError, memberApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type {
  AssignableWorkspaceRole,
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

  const addMutation = useMutation({
    mutationFn: (dto: { email: string; role: AssignableWorkspaceRole }) =>
      memberApi.add(currentWorkspaceId!, dto),
    onSuccess: () => {
      invalidate();
      setInviteEmail('');
      setInviteRole('member');
      setError(null);
    },
    onError: (err) => onError(err, 'Failed to add member.'),
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

  const submitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    addMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
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

      <div className="max-w-2xl space-y-6">

        {/* Members List */}
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
                          className="bg-brand-surface border border-brand-border text-text-secondary px-2 py-1 rounded text-[9px] font-mono font-semibold uppercase cursor-pointer outline-hidden"
                        >
                          <option value="admin">admin</option>
                          <option value="member">member</option>
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

        {/* Invite member */}
        {canManage && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2 mb-1 font-bold">
              Invite a member
            </span>

            <form onSubmit={submitInvite} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
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
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={addMutation.isPending || !inviteEmail.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all"
              >
                {addMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Adding member…
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-white" />
                    Add member
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>

    </div>
  );
}
