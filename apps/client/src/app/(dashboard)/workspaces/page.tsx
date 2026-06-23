'use client';

import React, { useState } from 'react';
import {
  Layers,
  Plus,
  ArrowLeft,
  Users,
  Trash2,
  RefreshCw,
  ChevronRight,
  UserPlus,
} from 'lucide-react';

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: 'Workspace Admin' | 'Editor' | 'Viewer';
}

interface Workspace {
  id: string;
  name: string;
  description: string;
  slug: string;
  createdAt: string;
  members: WorkspaceMember[];
}

const ORG_MEMBERS = [
  { id: 'm1', name: 'Anowar Hosen', email: 'anowarhosen444@gmail.com' },
  { id: 'm2', name: 'Sohail Rahaman', email: 'sohail@wriven-partner.com' },
];

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([
    {
      id: 'ws_1',
      name: 'Main Website',
      description: 'Primary marketing site content and blog articles.',
      slug: 'main-website',
      createdAt: '2026-05-01',
      members: [
        { id: 'm1', name: 'Anowar Hosen', email: 'anowarhosen444@gmail.com', role: 'Workspace Admin' },
        { id: 'm2', name: 'Sohail Rahaman', email: 'sohail@wriven-partner.com', role: 'Editor' },
      ],
    },
    {
      id: 'ws_2',
      name: 'Product Docs',
      description: 'Technical documentation and product spec sheets.',
      slug: 'product-docs',
      createdAt: '2026-05-15',
      members: [
        { id: 'm1', name: 'Anowar Hosen', email: 'anowarhosen444@gmail.com', role: 'Workspace Admin' },
      ],
    },
  ]);

  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);

  // Create form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Add member to workspace
  const [addMemberId, setAddMemberId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState<'Editor' | 'Viewer'>('Editor');
  const [isAddingMember, setIsAddingMember] = useState(false);

  const createWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    setTimeout(() => {
      const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const ws: Workspace = {
        id: 'ws_' + Math.random().toString(36).slice(2, 6),
        name: newName,
        description: newDesc || 'A new workspace.',
        slug,
        createdAt: new Date().toISOString().slice(0, 10),
        members: [
          { id: 'm1', name: 'Anowar Hosen', email: 'anowarhosen444@gmail.com', role: 'Workspace Admin' },
        ],
      };
      setWorkspaces(prev => [...prev, ws]);
      setNewName('');
      setNewDesc('');
      setIsCreating(false);
    }, 900);
  };

  const deleteWorkspace = (id: string) => {
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    if (selectedWorkspace?.id === id) setSelectedWorkspace(null);
  };

  const addMemberToWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMemberId || !selectedWorkspace) return;
    const orgMember = ORG_MEMBERS.find(m => m.id === addMemberId);
    if (!orgMember) return;

    setIsAddingMember(true);
    setTimeout(() => {
      const updatedWs: Workspace = {
        ...selectedWorkspace,
        members: [...selectedWorkspace.members, { ...orgMember, role: addMemberRole }],
      };
      setWorkspaces(prev => prev.map(w => w.id === updatedWs.id ? updatedWs : w));
      setSelectedWorkspace(updatedWs);
      setAddMemberId('');
      setIsAddingMember(false);
    }, 800);
  };

  const removeMemberFromWorkspace = (memberId: string) => {
    if (!selectedWorkspace) return;
    const updatedWs: Workspace = {
      ...selectedWorkspace,
      members: selectedWorkspace.members.filter(m => m.id !== memberId),
    };
    setWorkspaces(prev => prev.map(w => w.id === updatedWs.id ? updatedWs : w));
    setSelectedWorkspace(updatedWs);
  };

  // Detail view
  if (selectedWorkspace) {
    const availableToAdd = ORG_MEMBERS.filter(
      m => !selectedWorkspace.members.some(wm => wm.id === m.id)
    );

    return (
      <div className="space-y-8 text-left" id="workspace-detail-view">

        {/* Header */}
        <div className="border-b border-brand-border pb-5">
          <button
            onClick={() => setSelectedWorkspace(null)}
            className="flex items-center gap-1.5 text-2xs font-mono text-text-muted hover:text-brand-accent transition-colors mb-3 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Workspaces
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
                {selectedWorkspace.name}
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-2xs font-mono bg-brand-surface-soft border border-brand-border text-text-secondary px-2 py-0.5 rounded font-bold">
                  slug: {selectedWorkspace.slug}
                </span>
                <span className="text-2xs font-mono text-text-muted">
                  Created {selectedWorkspace.createdAt}
                </span>
              </div>
            </div>
            <button
              onClick={() => deleteWorkspace(selectedWorkspace.id)}
              className="inline-flex items-center gap-1.5 border border-brand-border hover:border-status-error/40 hover:bg-status-error/5 hover:text-status-error text-text-muted font-mono text-2xs px-3 py-2 rounded-lg cursor-pointer transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Workspace
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Members list */}
          <div className="lg:col-span-7 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-secondary" />
              Workspace Members ({selectedWorkspace.members.length})
            </span>

            <div className="space-y-2" id="workspace-members-list">
              {selectedWorkspace.members.map(member => {
                const initials = member.name.split(' ').map(n => n[0]).join('');
                const isAdmin = member.role === 'Workspace Admin';
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 p-3 border border-brand-border bg-brand-surface-soft/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/15 border border-brand-border text-brand-accent font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <div>
                        <p className="text-2xs font-mono font-bold text-text-primary">{member.name}</p>
                        <p className="text-[9.5px] font-mono text-text-muted">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-brand-surface border border-brand-border text-text-secondary px-2 py-0.5 rounded text-[8px] font-mono font-semibold uppercase">
                        {member.role}
                      </span>
                      {!isAdmin && (
                        <button
                          onClick={() => removeMemberFromWorkspace(member.id)}
                          className="p-1 hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors"
                          title="Remove from workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add member to workspace */}
          <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs space-y-4 sticky top-6">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-brand-secondary" />
              Add to Workspace
            </span>

            {availableToAdd.length === 0 ? (
              <p className="text-2xs font-mono text-text-muted text-center py-4 leading-relaxed">
                All org members are already in this workspace.
              </p>
            ) : (
              <form onSubmit={addMemberToWorkspace} className="space-y-4">
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5">Select Org Member</label>
                  <select
                    value={addMemberId}
                    onChange={(e) => setAddMemberId(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-none cursor-pointer"
                  >
                    <option value="">— Select member —</option>
                    {availableToAdd.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5">Workspace Role</label>
                  <select
                    value={addMemberRole}
                    onChange={(e) => setAddMemberRole(e.target.value as 'Editor' | 'Viewer')}
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-none cursor-pointer"
                  >
                    <option value="Editor">Editor — create and edit content</option>
                    <option value="Viewer">Viewer — read-only access</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isAddingMember || !addMemberId}
                  className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all"
                >
                  {isAddingMember ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Adding...</>
                  ) : (
                    <><UserPlus className="w-3.5 h-3.5" />Add to Workspace</>
                  )}
                </button>
              </form>
            )}

            <div className="pt-2 border-t border-brand-border">
              <p className="text-[10px] font-mono text-text-muted leading-relaxed">
                Only org members can be added. Invite new members via{' '}
                <a href="/workspaces" className="text-brand-accent hover:underline">Organization</a>.
              </p>
            </div>
          </div>

        </div>

      </div>
    );
  }

  // List view
  return (
    <div className="space-y-8 text-left" id="workspaces-list-view">

      {/* Page Header */}
      <div className="border-b border-brand-border pb-5">
        <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
          Workspaces
        </h1>
        <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
          {"// Organize content across isolated project environments within your org"}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Workspace cards */}
        <div className="lg:col-span-8 space-y-4" id="workspaces-list">
          {workspaces.length === 0 ? (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-12 text-center font-mono text-xs text-text-muted">
              No workspaces yet. Create your first one.
            </div>
          ) : (
            workspaces.map(ws => (
              <div
                key={ws.id}
                className="bg-brand-surface border border-brand-border hover:border-brand-accent/30 rounded-xl p-5 shadow-xs transition-all"
                id={`workspace-card-${ws.slug}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-brand-secondary shrink-0" />
                      <h3 className="font-display font-bold text-base text-text-primary tracking-tight">{ws.name}</h3>
                    </div>
                    <p className="text-2xs font-mono text-text-secondary leading-relaxed">{ws.description}</p>
                    <div className="flex items-center gap-3 text-3xs font-mono text-text-muted pt-0.5">
                      <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1.5 py-0.5 rounded font-bold">
                        slug: {ws.slug}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {ws.members.length} member{ws.members.length !== 1 ? 's' : ''}
                      </span>
                      <span>Created {ws.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => deleteWorkspace(ws.id)}
                      className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors"
                      title="Delete workspace"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSelectedWorkspace(ws)}
                      className="inline-flex items-center gap-1.5 border border-brand-border hover:border-brand-accent hover:text-brand-accent text-text-secondary font-mono font-bold text-2xs px-3 py-2 rounded-lg cursor-pointer transition-all"
                    >
                      Open
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create workspace form */}
        <div className="lg:col-span-4 bg-brand-surface border border-brand-border rounded-xl p-5 shadow-xs space-y-4 sticky top-6">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-brand-secondary" />
            New Workspace
          </span>

          <form onSubmit={createWorkspace} className="space-y-4">
            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="ws-name">
                Workspace Name
              </label>
              <input
                id="ws-name"
                type="text"
                placeholder="e.g. Marketing Site"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="ws-desc">
                Description
              </label>
              <textarea
                id="ws-desc"
                rows={3}
                placeholder="What content does this workspace manage?"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3 py-2.5 text-text-primary focus:outline-none focus:border-brand-accent resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating || !newName.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg neo-shadow cursor-pointer transition-all"
            >
              {isCreating ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Creating...</>
              ) : (
                <><Plus className="w-3.5 h-3.5" />Create Workspace</>
              )}
            </button>
          </form>
        </div>

      </div>

    </div>
  );
}
