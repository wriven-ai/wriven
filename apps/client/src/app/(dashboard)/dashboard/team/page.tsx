'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Mail, 
  Globe, 
  Radio, 
  Check, 
  RefreshCw, 
  Shield, 
  Sparkles, 
  Info, 
  ExternalLink,
  Lock
} from 'lucide-react';

interface Teammate {
  id: string;
  name: string;
  email: string;
  role: 'Instance Owner' | 'Content Architect' | 'Draft Contributor';
  status: 'Active' | 'Pending';
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: 'Active' | 'Paused';
}

export default function TeamWebhooksPage() {
  const [teammates, setTeammates] = useState<Teammate[]>([
    {
      id: "t1",
      name: "Anowar Hosen",
      email: "anowarhosen444@gmail.com",
      role: "Instance Owner",
      status: "Active"
    },
    {
      id: "t2",
      name: "Sohail Rahaman",
      email: "sohail@wriven-partner.com",
      role: "Content Architect",
      status: "Active"
    }
  ]);

  const [webhooks, setWebhooks] = useState<Webhook[]>([
    {
      id: "wh1",
      name: "Vercel Deploy Webhook",
      url: "https://api.vercel.com/v1/integrations/deploy/prj_wriven/prod",
      events: ["entry.publish", "entry.unpublish"],
      status: "Active"
    },
    {
      id: "wh2",
      name: "Netlify Static Builder Rebuild",
      url: "https://api.netlify.com/build_hooks/6f89b...",
      events: ["media.create", "schema.update"],
      status: "Paused"
    }
  ]);

  // Inviting states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<Teammate['role']>('Draft Contributor');
  const [isInviting, setIsInviting] = useState(false);

  // Webhook states
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["entry.publish"]);
  const [isCreatingWh, setIsCreatingWh] = useState(false);

  const inviteTeammate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;

    setIsInviting(true);
    setTimeout(() => {
      const newTeammate: Teammate = {
        id: "t_" + Math.floor(Math.random() * 1000).toString(),
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
        status: "Pending"
      };

      setTeammates([...teammates, newTeammate]);
      setInviteEmail('');
      setInviteName('');
      setIsInviting(false);
    }, 1000);
  };

  const removeTeammate = (id: string) => {
    setTeammates(teammates.filter(t => t.id !== id));
  };

  const toggleWebhookStatus = (id: string) => {
    setWebhooks(webhooks.map(wh => {
      if (wh.id === id) {
        return { ...wh, status: wh.status === 'Active' ? 'Paused' : 'Active' };
      }
      return wh;
    }));
  };

  const removeWebhook = (id: string) => {
    setWebhooks(webhooks.filter(wh => wh.id !== id));
  };

  const createWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim() || !whUrl.trim()) return;

    setIsCreatingWh(true);
    setTimeout(() => {
      const newWh: Webhook = {
        id: "wh_" + Math.floor(Math.random() * 1000).toString(),
        name: whName,
        url: whUrl,
        events: selectedEvents,
        status: "Active"
      };

      setWebhooks([...webhooks, newWh]);
      setWhName('');
      setWhUrl('');
      setIsCreatingWh(false);
    }, 1000);
  };

  const toggleEventSelect = (event: string) => {
    if (selectedEvents.includes(event)) {
      setSelectedEvents(selectedEvents.filter(e => e !== event));
    } else {
      setSelectedEvents([...selectedEvents, event]);
    }
  };

  return (
    <div className="space-y-8 text-left" id="team-webhooks-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Collaboration & <span className="font-normal italic text-brand-secondary">Webhooks Control</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Define deployment triggers and invite fellow co-creators to your node tenant"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Collaborators pane */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Teammates List */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2 mb-1.5 font-bold flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-secondary" />
              Committed Console Owners
            </span>

            <div className="space-y-3.5" id="teammates-rows">
              {teammates.map((teammate) => {
                const initials = teammate.name.split(' ').map(n => n[0]).join('');
                return (
                  <div key={teammate.id} className="flex items-center justify-between gap-3 p-3 border border-brand-border bg-brand-surface-soft/40 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-accent/15 border border-brand-border text-brand-accent font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-2xs font-mono font-bold text-text-primary truncate">{teammate.name}</p>
                          <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            teammate.status === 'Active' 
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                              : 'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse'
                          }`}>
                            {teammate.status}
                          </span>
                        </div>
                        <p className="text-[9.5px] font-mono text-text-muted select-all truncate">{teammate.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="bg-brand-surface border border-brand-border text-text-secondary px-2 py-0.5 rounded text-[8px] font-mono font-semibold uppercase">{teammate.role}</span>
                      {teammate.role !== 'Instance Owner' && (
                        <button
                          onClick={() => removeTeammate(teammate.id)}
                          className="p-1 hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors"
                          title="Revoke member seats"
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

          {/* Invitation builder */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2 mb-1 font-bold">
              Dispatch Secure Telegram Invitation
            </span>

            <form onSubmit={inviteTeammate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="collab-name">Collaborator Name</label>
                  <input 
                    id="collab-name"
                    type="text" 
                    placeholder="e.g. Robin Banks" 
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="collab-email">Invite Email</label>
                  <input 
                    id="collab-email"
                    type="email" 
                    placeholder="e.g. robin@wriven.io" 
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-mono text-text-secondary mb-1.5">Assigned Tenant Privileges</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary outline-hidden cursor-pointer"
                >
                  <option value="Draft Contributor">Draft Contributor (Can outline blog copy drafts only)</option>
                  <option value="Content Architect">Content Architect (Create database structure schemas and model parameters)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isInviting || !inviteEmail.trim() || !inviteName.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all"
              >
                {isInviting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Dispatching invitation envelope...
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 text-white" />
                    Dispatch Co-creator Pass
                  </>
                )}
              </button>
            </form>
          </div>

        </div>

        {/* Right Side: Webhooks and API triggers panel */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Active webhooks list */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2 mb-1.5 font-bold flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-brand-secondary" />
              Committed Webhook Relays
            </span>

            <div className="space-y-3.5" id="webhooks-rows">
              {webhooks.map((wh) => (
                <div 
                  key={wh.id} 
                  className={`border p-3.5 rounded-xl text-left space-y-3 transition-colors ${
                    wh.status === 'Paused' 
                      ? 'border-brand-border/40 opacity-55 bg-brand-surface-soft/25' 
                      : 'border-brand-border bg-brand-surface-soft/40'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="text-2xs font-mono font-bold text-text-primary tracking-tight truncate leading-none mb-1">
                        {wh.name}
                      </h3>
                      <div className="text-[9px] font-mono text-text-muted truncate select-all">{wh.url}</div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => toggleWebhookStatus(wh.id)}
                        className={`p-1 px-1.5 border rounded text-[9px] font-mono font-bold cursor-pointer ${
                          wh.status === 'Active' 
                            ? 'border-amber-500/20 text-amber-500 hover:bg-amber-500/10' 
                            : 'border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10'
                        }`}
                      >
                        {wh.status === 'Active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => removeWebhook(wh.id)}
                        className="p-1 hover:bg-status-error/15 hover:text-status-error text-text-muted border border-brand-border rounded cursor-pointer"
                        title="Delete Webhook"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 border-t border-brand-border/60 pt-2 text-[8px] font-mono leading-none">
                    <span className="text-text-muted font-bold mr-1 select-none">TRIGGERS:</span>
                    {wh.events.map(ev => (
                      <span key={ev} className="bg-brand-surface border border-brand-border px-1.5 py-0.5 rounded text-text-primary font-bold">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Webhook Architect builder */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left space-y-4">
            <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 mb-1 font-bold">
              Commission Webhook Endpoints
            </span>

            <form onSubmit={createWebhook} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="webhook-name">Relay Identifier Name</label>
                  <input 
                    id="webhook-name"
                    type="text" 
                    placeholder="e.g. Gatsby Build hook" 
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="webhook-endpoint">Target HTTP POST URL</label>
                  <input 
                    id="webhook-endpoint"
                    type="url" 
                    placeholder="https://your-site.com/rebuild" 
                    value={whUrl}
                    onChange={(e) => setWhUrl(e.target.value)}
                    required
                    className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Event selectors checks box */}
              <div>
                <label className="block text-2xs font-mono text-text-secondary mb-1.5">Registered Event Listeners</label>
                <div className="grid grid-cols-2 gap-2 text-2xs font-mono">
                  {["entry.publish", "entry.unpublish", "media.create", "schema.update"].map(eName => {
                    const isChecked = selectedEvents.includes(eName);
                    return (
                      <button
                        type="button"
                        key={eName}
                        onClick={() => toggleEventSelect(eName)}
                        className={`p-2 border rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer ${
                          isChecked 
                            ? 'border-brand-accent bg-brand-accent/5 text-brand-accent font-bold' 
                            : 'border-brand-border bg-brand-surface-soft/40 hover:bg-brand-surface-soft'
                        }`}
                      >
                        <span>{eName}</span>
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreatingWh || !whName.trim() || !whUrl.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg cursor-pointer transition-all animate-pulse-once"
              >
                {isCreatingWh ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Mounting webhook channel...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-white" />
                    Activate Webhook Endpoint Relay
                  </>
                )}
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
