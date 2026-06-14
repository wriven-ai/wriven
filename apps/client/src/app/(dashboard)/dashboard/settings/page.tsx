'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Save,
  Check,
  Globe,
  RefreshCw,
  Sliders,
} from 'lucide-react';

export default function SettingsPage() {
  const [projectName, setProjectName] = useState('Wriven CMS Core');
  const [projectUrl, setProjectUrl] = useState('https://wriven-core.anowarhosen.dev');
  const [defaultLocale, setDefaultLocale] = useState('en-GLOBAL');
  const [webhookSecret, setWebhookSecret] = useState('whsec_cf5c9a4bb119ecfe7bf');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 1000);
  };

  return (
    <div className="space-y-8 text-left" id="settings-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            System & <span className="font-normal italic text-brand-secondary">Core Platform Settings</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Adjust cache duration values and instance identity for static export ingests"}
          </p>
        </div>

        <div>
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button px-4 py-2 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer neo-shadow"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Flushing system hooks...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                Settings Saved!
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-white" />
                Commit System Updates
              </>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">

        {/* Section: Project Identity */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-brand-secondary" />
            Core Instance Identification
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="project-name">Project / Tenant Title</label>
              <input
                id="project-name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-hidden focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="default-locale">Root API Locale Index</label>
              <select
                id="default-locale"
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value)}
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-2.5 text-text-primary focus:outline-hidden focus:border-brand-accent cursor-pointer"
              >
                <option value="en-GLOBAL">en-GLOBAL (Universal)</option>
                <option value="es-LATAM">es-LATAM (Spanish)</option>
                <option value="de-EURO">de-EURO (German)</option>
                <option value="ja-APAC">ja-APAC (Japanese)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="project-url">Project Target Site URL</label>
            <input
              id="project-url"
              type="url"
              value={projectUrl}
              onChange={(e) => setProjectUrl(e.target.value)}
              className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-hidden focus:border-brand-accent"
            />
          </div>
        </div>

        {/* Section: Webhook Authentication details */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-brand-secondary" />
            Webhook Integration Secrets
          </span>

          <div>
            <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="webhook-secret">Shared Webhook Secret Signature (HMAC)</label>
            <input
              id="webhook-secret"
              type="text"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-hidden focus:border-brand-accent font-bold"
            />
            <p className="text-3xs font-mono text-text-muted mt-1.5">
              Utilize this secure signature key to verify incoming HTTP POST payloads inside secondary applications to guarantee authentic request sources.
            </p>
          </div>
        </div>

      </form>

    </div>
  );
}
