'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Lock, 
  ShieldAlert, 
  RefreshCw, 
  Download,
  Terminal,
  Activity,
  Sparkles
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  token: string;
  scope: 'Read-Only Draft' | 'Read-Only Content Cache' | 'Full Read/Write Access';
  requestsMonth: number;
  createdAt: string;
  status: 'active' | 'revoked';
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([
    {
      id: "key_6f183",
      name: "Wriven Production Read-Only CDN Key",
      token: "wr_live_cf89b33a7e289bf44a100fb",
      scope: "Read-Only Content Cache",
      requestsMonth: 124502,
      createdAt: "2026-06-01 10:14",
      status: "active"
    },
    {
      id: "key_28db9",
      name: "Anowar Local development Token",
      token: "wr_dev_abbc11289cf7fb3e412aef912",
      scope: "Full Read/Write Access",
      requestsMonth: 489,
      createdAt: "2026-06-03 16:33",
      status: "active"
    }
  ]);

  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<ApiKey['scope']>('Read-Only Content Cache');
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Generating overlay state
  const [isGenerating, setIsGenerating] = useState(false);

  const createApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsGenerating(true);
    setTimeout(() => {
      const generatedPrefix = newScope === "Full Read/Write Access" ? "wr_admin_" : "wr_live_";
      const hexChars = "abcdef0123456789";
      let randomToken = generatedPrefix;
      for (let i = 0; i < 24; i++) {
        randomToken += hexChars[Math.floor(Math.random() * hexChars.length)];
      }

      const newKey: ApiKey = {
        id: "key_" + Math.floor(Math.random() * 90000 + 10000).toString(16),
        name: newName,
        token: randomToken,
        scope: newScope,
        requestsMonth: 0,
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
        status: "active"
      };

      setKeys([newKey, ...keys]);
      setNewName('');
      setIsGenerating(false);
    }, 1000);
  };

  const revokeKey = (id: string) => {
    setKeys(keys.map(key => {
      if (key.id === id) {
        return { ...key, status: key.status === 'active' ? 'revoked' : 'active' };
      }
      return key;
    }));
  };

  const deleteKeyPermanently = (id: string) => {
    setKeys(keys.filter(key => key.id !== id));
  };

  const toggleReveal = (id: string) => {
    if (revealedIds.includes(id)) {
      setRevealedIds(revealedIds.filter(i => i !== id));
    } else {
      setRevealedIds([...revealedIds, id]);
    }
  };

  const copyToClipboard = (token: string, id: string) => {
    navigator.clipboard.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8 text-left" id="api-keys-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Security & <span className="font-normal italic text-brand-secondary">API Access Tokens</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Configure secure integrations capable of targeting Wriven data endpoints"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column: Key creation builder */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5" id="create-key-pane">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Commission API Access Token
          </span>

          <form onSubmit={createApiKey} className="space-y-5">
            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="api-key-name">Token Application Context</label>
              <input 
                id="api-key-name"
                type="text" 
                placeholder="e.g. Next.js Frontend Production Core..." 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent h-11"
              />
            </div>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5">Authorization Scope Permission</label>
              <div className="space-y-2 mt-1.5">
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-brand-border bg-brand-surface-soft/40 cursor-pointer select-none hover:bg-brand-surface-soft">
                  <input 
                    type="radio" 
                    name="scope-group" 
                    checked={newScope === 'Read-Only Content Cache'}
                    onChange={() => setNewScope('Read-Only Content Cache')}
                    className="mt-0.5 text-brand-accent border-brand-border cursor-pointer focus:ring-0" 
                  />
                  <div>
                    <p className="text-2xs font-mono font-bold text-text-primary">Read-Only Content Cache</p>
                    <p className="text-[9.5px] text-text-muted font-light mt-0.5 leading-relaxed">Allows fetching compiled pages & static assets from global CDN nodes. Safely exposed client-side.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-brand-border bg-brand-surface-soft/40 cursor-pointer select-none hover:bg-brand-surface-soft">
                  <input 
                    type="radio" 
                    name="scope-group" 
                    checked={newScope === 'Read-Only Draft'}
                    onChange={() => setNewScope('Read-Only Draft')}
                    className="mt-0.5 text-brand-accent border-brand-border cursor-pointer focus:ring-0" 
                  />
                  <div>
                    <p className="text-2xs font-mono font-bold text-text-primary">Read-Only Draft Permissions</p>
                    <p className="text-[9.5px] text-text-muted font-light mt-0.5 leading-relaxed">Enables previewing both un-inked drafts & cached entries. Best for preview routing environments.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-brand-border bg-brand-surface-soft/40 cursor-pointer select-none hover:bg-brand-surface-soft">
                  <input 
                    type="radio" 
                    name="scope-group" 
                    checked={newScope === 'Full Read/Write Access'}
                    onChange={() => setNewScope('Full Read/Write Access')}
                    className="mt-0.5 text-brand-accent border-brand-border cursor-pointer focus:ring-0" 
                  />
                  <div>
                    <p className="text-2xs font-mono font-bold text-text-primary">Full Administrative Read/Write Access</p>
                    <p className="text-[9.5px] text-text-muted font-light mt-0.5 leading-relaxed">Full privileges. Create schemas, draft copy, or erase files programmatically. DO NOT expose client-side!</p>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating || !newName.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg neo-shadow cursor-pointer transition-all"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Generating secure keys...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-white" />
                  Generate Secure Access Token
                </>
              )}
            </button>
          </form>

          {/* Security Alert Warning block */}
          <div className="bg-brand-surface border border-brand-border p-4 rounded-xl text-left space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-mono text-status-warning font-black uppercase">
              <ShieldAlert className="w-4 h-4 text-amber-500 animate-pulse" />
              ★ Secure Key Guidelines
            </div>
            <p className="text-[10.5px] text-text-secondary leading-relaxed font-light">
              Always safeguard administrative authorization keys. Store them inside server environment configs (<code className="font-mono bg-brand-surface-soft border border-brand-border px-1 py-0.2 rounded text-[9.5px]">process.env.WR_ADMIN_TOKEN</code>).
            </p>
          </div>

        </div>

        {/* Right column: Registered keys table list */}
        <div className="lg:col-span-7 space-y-4" id="api-keys-list-pane">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block px-1 font-bold">
            Active Integration Tokens ({keys.length})
          </span>

          <div className="space-y-4">
            {keys.map((key) => {
              const isRevealed = revealedIds.includes(key.id);
              const isRevoked = key.status === 'revoked';

              return (
                <div 
                  key={key.id}
                  className={`bg-brand-surface border rounded-xl p-5 text-left shadow-xs transition-all ${
                    isRevoked 
                      ? 'border-brand-border/40 opacity-60 bg-brand-surface-soft/20' 
                      : 'border-brand-border hover:border-brand-accent/30'
                  }`}
                  id={`api-key-card-${key.id}`}
                >
                  {/* Top line of Key */}
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 leading-none">
                        <Key className={`w-3.5 h-3.5 ${isRevoked ? 'text-text-muted' : 'text-brand-secondary'}`} />
                        <h3 className={`font-display font-bold text-sm tracking-tight truncate ${isRevoked ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                          {key.name}
                        </h3>
                      </div>
                      <div className="flex gap-1.5 text-[9px] font-mono text-text-muted leading-none mt-1">
                        <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1 rounded uppercase font-bold text-[8px]">{key.scope}</span>
                        <span>•</span>
                        <span>Issued: {key.createdAt}</span>
                      </div>
                    </div>

                    {/* Quick controls */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => revokeKey(key.id)}
                        className={`p-1.5 px-2.5 border rounded-lg font-mono text-3xs font-semibold leading-none cursor-pointer transition-colors ${
                          isRevoked 
                            ? 'border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10' 
                            : 'border-brand-border text-text-secondary hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30'
                        }`}
                      >
                        {isRevoked ? 'Re-enable' : 'Revoke'}
                      </button>
                      <button
                        onClick={() => deleteKeyPermanently(key.id)}
                        className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Token presentation field */}
                  <div className="mt-4 flex items-center justify-between border border-brand-border-button bg-brand-surface-soft rounded-lg p-2.5 px-3.5 font-mono text-[10px] text-text-secondary select-all">
                    <div className="truncate pr-4 flex-grow tracking-wide">
                      {isRevoked ? (
                        <span className="text-text-muted italic">🚫 TOKEN_REVOKED_DEACTIVATED</span>
                      ) : isRevealed ? (
                        <span className="text-brand-secondary font-bold font-mono">{key.token}</span>
                      ) : (
                        <span>•••••••••••••••••••••••••••••••••••</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 select-none">
                      <button
                        type="button"
                        onClick={() => toggleReveal(key.id)}
                        disabled={isRevoked}
                        className="p-1 hover:bg-brand-border text-text-muted hover:text-text-primary rounded transition-colors disabled:opacity-50"
                        title={isRevealed ? "Hide Value" : "Reveal Value"}
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(key.token, key.id)}
                        disabled={isRevoked}
                        className="p-1 hover:bg-brand-border text-text-muted hover:text-text-primary rounded transition-colors disabled:opacity-50 relative"
                        title="Copy to clipboard"
                      >
                        {copiedId === key.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Usage Indicators */}
                  {!isRevoked && (
                    <div className="mt-3 flex items-center gap-5 font-mono text-[9.5px] text-text-muted border-t border-brand-border pt-3">
                      <div className="flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-text-muted" />
                        <span>Monthly Requests: </span>
                        <strong className="text-text-primary font-bold">{key.requestsMonth.toLocaleString()} calls</strong>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          {/* cURL instructions block */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 text-left">
            <h4 className="text-xs font-mono font-bold text-text-primary mb-2 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-brand-secondary" />
              REST Endpoint Query Example
            </h4>
            <div className="bg-brand-surface-soft border border-brand-border rounded-lg p-3.5 font-mono text-[10px] text-text-secondary overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
              {`curl -X GET "https://wriven.io/api/v1/content?schema=blog-articles" \\\n  -H "Authorization: Bearer wr_live_cf89b33a7e289bf44a100fb"`}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
