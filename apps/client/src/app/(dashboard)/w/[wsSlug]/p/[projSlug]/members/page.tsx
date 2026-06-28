'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Mail, RefreshCw, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import {
  ApiRequestError,
  invitationApi,
  memberApi,
  projectMemberApi,
} from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceProjects } from '@/hooks/use-workspace-projects';
import type { InvitationView, ProjectMemberView, ProjectRole } from '@/lib/types';

const PROJECT_ROLES: ProjectRole[] = ['admin', 'editor', 'viewer'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
  editor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  viewer: 'bg-brand-surface text-text-secondary border-brand-border',
};

export default function ProjectMembersPage() {
  const { projSlug } = useParams<{ projSlug: string }>();
  const { user, currentWorkspaceId } = useAuth();
  const { projects } = useWorkspaceProjects();
  const project = projects.find((p) => p.slug === projSlug) ?? null;
  const projectId = project?.id;

  const queryClient = useQueryClient();
  const queryKey = ['project-members', projectId];

  const [addMode, setAddMode] = useState<'existing' | 'invite'>('existing');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('editor');
  const [error, setError] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey,
    queryFn: () => projectMemberApi.list(projectId!),
    enabled: !!projectId,
  });

  // Workspace members are the pool to add from without typing an email.
  const { data: workspaceMembers } = useQuery({
    queryKey: ['workspace-members', currentWorkspaceId],
    queryFn: () => memberApi.list(currentWorkspaceId!),
    enabled: !!currentWorkspaceId,
  });

  // Workspace members not already on the project.
  const candidates = (workspaceMembers ?? []).filter(
    (wm) => !(members ?? []).some((pm) => pm.userId === wm.userId),
  );

  const callerRole = members?.find((m) => m.userId === user?.id)?.role;
  const canManage = callerRole === 'admin';

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const onError = (err: unknown, fallback: string) =>
    setError(err instanceof ApiRequestError ? err.message : fallback);

  const addMutation = useMutation({
    mutationFn: (dto: { email: string; role: ProjectRole }) =>
      projectMemberApi.add(projectId!, dto),
    onSuccess: () => {
      invalidate();
      setInviteEmail('');
      setSelectedEmail('');
      setInviteRole('editor');
      setError(null);
    },
    onError: (err) => onError(err, 'Failed to add member.'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      projectMemberApi.updateRole(projectId!, userId, role),
    onSuccess: invalidate,
    onError: (err) => onError(err, 'Failed to update role.'),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => projectMemberApi.remove(projectId!, userId),
    onSuccess: invalidate,
    onError: (err) => onError(err, 'Failed to remove member.'),
  });

  // Pending invitations (new emails that haven't accepted yet).
  const invitesKey = ['project-invitations', projectId];
  const { data: invites } = useQuery({
    queryKey: invitesKey,
    queryFn: () => invitationApi.listProject(projectId!),
    enabled: !!projectId && canManage,
  });
  const invalidateInvites = () =>
    queryClient.invalidateQueries({ queryKey: invitesKey });

  const inviteMutation = useMutation({
    mutationFn: (dto: { email: string; role: ProjectRole }) =>
      invitationApi.createProject(projectId!, dto),
    onSuccess: () => {
      invalidateInvites();
      setInviteEmail('');
      setInviteRole('editor');
      setError(null);
    },
    onError: (err) => onError(err, 'Failed to send invitation.'),
  });

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
    if (addMode === 'invite') {
      // Brand-new email → create a pending invitation (emails an accept link).
      if (inviteEmail.trim()) {
        inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
      }
      return;
    }
    // Existing workspace member → add directly (they already have an account).
    if (selectedEmail) addMutation.mutate({ email: selectedEmail, role: inviteRole });
  };

  const canSubmit =
    addMode === 'existing' ? !!selectedEmail : !!inviteEmail.trim();

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-8 text-left" id="project-members">
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5">
        <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
          Project <span className="font-normal italic text-brand-secondary">Members</span>
        </h1>
        <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
          {`// Who can access ${project?.name ?? 'this project'} — admin · editor · viewer`}
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
            <div className="space-y-3.5">
              {members.map((member: ProjectMemberView) => {
                const isSelf = member.userId === user?.id;
                const editable = canManage && !isSelf;
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
                              role: e.target.value as ProjectRole,
                            })
                          }
                          className="bg-brand-surface border border-brand-border text-text-secondary px-2 py-1 rounded text-[9px] font-mono font-semibold cursor-pointer outline-hidden"
                        >
                          {PROJECT_ROLES.map((r) => (
                            <option key={r} value={r}>{cap(r)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-semibold uppercase border ${ROLE_BADGE[member.role] ?? ROLE_BADGE.viewer}`}>
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
              Add a member
            </span>

            {/* Mode toggle: pick a workspace member, or invite a new email. */}
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-brand-border bg-brand-surface-soft/40 p-1">
              {(
                [
                  { id: 'existing', label: 'Workspace member', Icon: Users },
                  { id: 'invite', label: 'New email', Icon: UserPlus },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setAddMode(id);
                    setError(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    addMode === id
                      ? 'bg-brand-accent text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={submitInvite} className="space-y-4">
              {addMode === 'existing' ? (
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="member-select">Workspace member</label>
                  <select
                    id="member-select"
                    value={selectedEmail}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    disabled={candidates.length === 0}
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-hidden cursor-pointer disabled:opacity-60"
                  >
                    <option value="">
                      {candidates.length === 0 ? 'All members already added' : '— Select a member —'}
                    </option>
                    {candidates.map((m) => (
                      <option key={m.userId} value={m.user.email}>
                        {m.user.name} ({m.user.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="invite-email">Email</label>
                  <input
                    id="invite-email"
                    type="email"
                    placeholder="e.g. teammate@wriven.io"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                  className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-hidden cursor-pointer"
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>{cap(r)}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={
                  addMutation.isPending || inviteMutation.isPending || !canSubmit
                }
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all"
              >
                {addMutation.isPending || inviteMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {addMode === 'invite' ? 'Sending…' : 'Adding member…'}
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-white" />
                    {addMode === 'invite' ? 'Send invitation' : 'Add member'}
                  </>
                )}
              </button>
            </form>

            <p className="text-[9.5px] font-mono text-text-muted leading-relaxed">
              {addMode === 'invite'
                ? 'The email must already have a Wriven account. '
                : ''}
              admin: full control · editor: create/edit content · viewer: read only.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
