'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Save,
  Check,
  RefreshCw,
  Quote,
  List,
  Database,
} from 'lucide-react';

export default function ContentEditorPage() {
  const [selectedSchema, setSelectedSchema] = useState('blog-articles');
  const [isAiExpanding, setIsAiExpanding] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('Analyze this intro paragraph, keep it professional and eye-friendly, and structure a 3-bullet core value breakdown.');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Field values
  const [title, setTitle] = useState('Why Headless Content Belongs on Symmetric Desktops');
  const [content, setContent] = useState(`Let's explore why standard legacy CMS setups are losing ground to consolidated desktop designs.\n\nTraditionally, a writer designs copy inside draft files, an architect models schemas inside database structures elsewhere, and a developer stitches JSON endpoints into a frontend framework.\n\nThis separation fragments context. Wriven consolidates this structure by centering copy drafting, database schemas, and AI generation controls on a single physical visual dashboard.`);

  const schemasList = [
    { slug: 'blog-articles', label: 'Blog Article Model (Custom Schema)' },
    { slug: 'product-specs', label: 'Product Specifications Technical' },
  ];

  const handleAiWeave = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiExpanding(true);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          tone: 'Professional',
          fieldType: 'Rich Markdown',
          currentContent: content
        })
      });

      const data = await response.json();
      if (data && data.text) {
        setContent(prev => prev + '\n\n' + data.text);
        setHasUnsavedChanges(true);
      }
    } catch (e) {
      // Fallback
      setContent(prev => prev + `\n\n[Wriven AI Output]\n- Consolidation removes redundant roundtrips across APIs.\n- Inline co-writing matches layout dimensions on-the-fly.\n- Immediate rendering reduces structural syntax verification friction.`);
      setHasUnsavedChanges(true);
    } finally {
      setIsAiExpanding(false);
      setAiPrompt('');
    }
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 1200);
  };

  const insertMarkdownText = (tag: 'bold' | 'italic' | 'quote' | 'list' | 'h1' | 'h2') => {
    const symbols = {
      bold: '****',
      italic: '__',
      quote: '> ',
      list: '- ',
      h1: '# ',
      h2: '## '
    };
    setContent(prev => prev + '\n' + symbols[tag]);
    setHasUnsavedChanges(true);
  };

  return (
    <div className="space-y-8 text-left" id="content-editor-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Headless <span className="font-normal italic text-brand-secondary">Content Editor</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Compose and structure copy for seamless publication layout delivery"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <span className="text-3xs font-mono text-brand-secondary bg-brand-secondary/10 px-2 py-1 rounded inline-block animate-pulse font-bold">● Draft contains unsaved changes</span>
          )}
          
          <button
            onClick={handleSaveEntry}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button px-5 py-2.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer neo-shadow"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Inking Draft...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                Draft saved!
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-white" />
                Save draft
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left column: Schema selector + Text Editor */}
        <div className="lg:col-span-7 space-y-5">

          {/* Schema Selector & Metadata row */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 font-mono text-2xs text-text-secondary">
              <Database className="w-4 h-4 text-brand-secondary" />
              <span>Target schematic model:</span>
              <select
                value={selectedSchema}
                onChange={(e) => {
                  setSelectedSchema(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="bg-brand-surface-soft border border-brand-border rounded px-2.5 py-1 text-text-primary outline-hidden font-bold cursor-pointer"
              >
                {schemasList.map(opt => (
                  <option key={opt.slug} value={opt.slug}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="text-3xs font-mono text-text-muted">
              Locale: <strong className="text-text-secondary font-bold">en-global</strong>
            </div>
          </div>

          {/* Form Area */}
          <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 sm:p-6 shadow-sm space-y-4 text-left">

            {/* Title Entry field */}
            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="editor-title-input">Post Article Title</label>
              <input
                id="editor-title-input"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full text-base sm:text-lg font-display font-medium bg-brand-surface-soft border border-brand-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-brand-accent tracking-tight animate-none"
                placeholder="Enter title identification..."
              />
            </div>

            {/* Markdown Toolbar and TextArea */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between border-b border-brand-border pb-2 gap-2 text-text-secondary">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => insertMarkdownText('bold')} className="p-1 px-2 border border-brand-border hover:bg-brand-surface-soft text-2xs font-mono rounded cursor-pointer font-bold" title="Insert Bold text">B</button>
                  <button type="button" onClick={() => insertMarkdownText('italic')} className="p-1 px-2 border border-brand-border hover:bg-brand-surface-soft text-2xs font-mono rounded cursor-pointer italic" title="Insert Italic text">I</button>
                  <button type="button" onClick={() => insertMarkdownText('quote')} className="p-1 border border-brand-border hover:bg-brand-surface-soft rounded cursor-pointer text-text-muted" title="Insert Blockquote"><Quote className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => insertMarkdownText('list')} className="p-1 border border-brand-border hover:bg-brand-surface-soft rounded cursor-pointer text-text-muted" title="Insert Bullet list"><List className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => insertMarkdownText('h1')} className="p-1 px-1.5 border border-brand-border hover:bg-brand-surface-soft text-3xs font-mono rounded cursor-pointer" title="Insert Header 1">H1</button>
                  <button type="button" onClick={() => insertMarkdownText('h2')} className="p-1 px-1.5 border border-brand-border hover:bg-brand-surface-soft text-3xs font-mono rounded cursor-pointer" title="Insert Header 2">H2</button>
                </div>
                <span className="text-[9px] font-mono text-text-muted">Draft length: {content.length} chars</span>
              </div>

              <textarea
                rows={14}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-4 text-text-primary focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent leading-relaxed resize-none"
                placeholder="Weave your structured story core markdown..."
              />
            </div>

          </div>

        </div>

        {/* Right column: AI Co-Writer */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm flex flex-col h-full" id="ai-copy-engraver">

            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-4 border-b border-brand-border shrink-0">
              <Sparkles className="w-4 h-4 text-brand-secondary" />
              <span className="text-[11px] font-mono font-bold tracking-wider text-text-primary">Wriven Co-Writer Assist</span>
              <span className="ml-auto text-[9px] font-mono bg-brand-secondary/10 text-brand-secondary px-2 py-0.5 rounded font-bold">AI</span>
            </div>

            {/* Context hint */}
            <div className="px-5 py-3 bg-brand-surface-soft/60 border-b border-brand-border">
              <p className="text-[10px] font-mono text-text-muted leading-relaxed">
                Describe what you want — expand a section, rewrite a paragraph, add a bullet breakdown, or translate copy.
              </p>
            </div>

            {/* Prompt area */}
            <div className="flex flex-col gap-3 p-5 flex-grow">
              <textarea
                rows={6}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Structure a bulleted core values breakdown or translate paragraph into formal tone..."
                className="w-full flex-grow text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg p-3 text-text-primary focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent leading-relaxed resize-none"
              />

              <button
                type="button"
                onClick={handleAiWeave}
                disabled={isAiExpanding || !aiPrompt.trim()}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-secondary hover:bg-brand-secondary/90 text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-xs py-3 px-4 rounded-lg cursor-pointer transition-all"
              >
                {isAiExpanding ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Weaving content...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Apply Suggestions
                  </>
                )}
              </button>
            </div>

            {/* Footer note */}
            <div className="px-5 py-3 border-t border-brand-border bg-brand-surface-soft/40 rounded-b-xl">
              <p className="text-[10px] font-mono text-text-muted leading-relaxed">
                Output appends to draft. Review before saving.
              </p>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
