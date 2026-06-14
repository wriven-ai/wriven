'use client';

import React, { useState } from 'react';
import {
  Building2,
  Save,
  Check,
  RefreshCw,
  Users,
  Mail,
  Trash2,
  Crown,
} from 'lucide-react';

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Member';
  status: 'Active' | 'Pending';
}

export default function OrganizationPage() {
  const [orgName, setOrgName] = useState("Anowar's Organization");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [members, setMembers] = useState<OrgMember[]>([
    { id: 'm1', name: 'Anowar Hosen', email: 'anowarhosen444@gmail.com', role: 'Owner', status: 'Active' },
    { id: 'm2', name: 'Sohail Rahaman', email: 'sohail@wriven-partner.com', role: 'Member', status: 'Active' },
  ]);

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Member'>('Member');
  const [isInviting, setIsInviting] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 1000);
  };

  const inviteMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setIsInviting(true);
    setTimeout(() => {
      setMembers(prev => [...prev, {
        id: 'm_' + Math.random().toString(36).slice(2, 7),
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
        status: 'Pending',
      }]);
      setInviteName('');
      setInviteEmail('');
      setIsInviting(false);
    }, 1000);
  };

  const removeMember = (id: string) => {
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const orgSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="space-y-8 text-left" id="organization-workspace">

      {/* Page Header */}
      <div className="border-b border-brand-border pb-5">
        <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
          Organization & <span className="font-normal italic text-brand-secondary">Members</span>
        </h1>
        <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
          {"// Manage your organization identity and invite members to collaborate"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left: Org Identity + Quota */}
        <div className="lg:col-span-5 space-y-5">

          <form onSubmit={handleSave} className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-brand-secondary" />
              Organization Identity
            </span>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="org-name">
                Organization Name
              </label>
              <input
                id="org-name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5">
                Organization Slug
              </label>
              <div className="w-full text-xs font-mono bg-brand-surface-soft/50 border border-brand-border rounded-lg p-3 text-text-muted select-all">
                {orgSlug}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] font-mono bg-brand-surface-soft border border-brand-border text-text-secondary px-2 py-1 rounded font-bold uppercase">
                Free Plan
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button px-4 py-2 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer"
              >
                {isSaving ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving...</>
                ) : saveSuccess ? (
                  <><Check className="w-3.5 h-3.5" />Saved!</>
                ) : (
                  <><Save className="w-3.5 h-3.5" />Save Changes</>
                )}
              </button>
            </div>
          </form>

          {/* Quota overview */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3 shadow-xs">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
              Plan Quota
            </span>
            <div className="space-y-2.5 font-mono text-2xs">
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Members</span>
                <strong className="text-text-primary">{members.length} / 5</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Workspaces</span>
                <strong className="text-text-primary">2 / 10</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted">API Keys</span>
                <strong className="text-text-primary">2 / 20</strong>
              </div>
            </div>
          </div>

        </div>

        {/* Right: Members + Invite */}
        <div className="lg:col-span-7 space-y-5">

          {/* Member list */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-secondary" />
              Members ({members.length})
            </span>

            <div className="space-y-2" id="org-members-list">
              {members.map((member) => {
                const initials = member.name.split(' ').map(n => n[0]).join('');
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 p-3 border border-brand-border bg-brand-surface-soft/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/15 border border-brand-border text-brand-accent font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-2xs font-mono font-bold text-text-primary truncate">{member.name}</p>
                          {member.status === 'Pending' && (
                            <span className="text-[8px] font-bold px-1.5 py-0.2 rounded uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-[9.5px] font-mono text-text-muted truncate">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {member.role === 'Owner' ? (
                        <span className="flex items-center gap-1 bg-brand-surface border border-brand-border text-brand-secondary px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase">
                          <Crown className="w-3 h-3" />
                          Owner
                        </span>
                      ) : (
                        <>
                          <span className="bg-brand-surface border border-brand-border text-text-secondary px-2 py-0.5 rounded text-[8px] font-mono font-semibold uppercase">
                            {member.role}
                          </span>
                          <button
                            onClick={() => removeMember(member.id)}
                            className="p-1 hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invite form */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
              Invite to Organization
            </span>

            <form onSubmit={inviteMember} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="invite-name">Name</label>
                  <input
                    id="invite-name"
                    type="text"
                    placeholder="e.g. Robin Banks"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-none focus:border-brand-accent"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="invite-email">Email</label>
                  <input
                    id="invite-email"
                    type="email"
                    placeholder="e.g. robin@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-none focus:border-brand-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-mono text-text-secondary mb-1.5">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'Admin' | 'Member')}
                  className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-none cursor-pointer"
                >
                  <option value="Member">Member — can view and edit content</option>
                  <option value="Admin">Admin — full access except billing</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isInviting || !inviteEmail.trim() || !inviteName.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all"
              >
                {isInviting ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Sending invite...</>
                ) : (
                  <><Mail className="w-3.5 h-3.5" />Send Invite</>
                )}
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
