'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  Plus, 
  Trash2, 
  Check, 
  FileText, 
  HelpCircle, 
  ChevronRight, 
  Type, 
  Image as ImageIcon, 
  Calendar, 
  Hash, 
  ListOrdered,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface ContentField {
  id: string;
  name: string;
  type: 'Short Text' | 'Rich Markdown' | 'Asset Image' | 'UTC Date' | 'Enum Select';
  required: boolean;
}

interface ContentType {
  id: string;
  name: string;
  slug: string;
  desc: string;
  fieldsCount: number;
  status: 'Published' | 'Draft';
  fields: ContentField[];
}

export default function ContentTypesPage() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([
    {
      id: 'type_1',
      name: 'Blog Articles',
      slug: 'blog-articles',
      desc: 'System schema representation for publication blogs, posts, resources and journals.',
      fieldsCount: 5,
      status: 'Published',
      fields: [
        { id: 'f1', name: 'Title', type: 'Short Text', required: true },
        { id: 'f2', name: 'Publish Date', type: 'UTC Date', required: true },
        { id: 'f3', name: 'Visual Cover', type: 'Asset Image', required: false },
        { id: 'f4', name: 'Article Content', type: 'Rich Markdown', required: true },
        { id: 'f5', name: 'Estimated Read Time', type: 'Enum Select', required: false },
      ]
    },
    {
      id: 'type_2',
      name: 'Product Specs',
      slug: 'product-specs',
      desc: 'Technical product documentation schemas incorporating deep specifications tables.',
      fieldsCount: 4,
      status: 'Draft',
      fields: [
        { id: 'f21', name: 'Product Name', type: 'Short Text', required: true },
        { id: 'f22', name: 'Specification details', type: 'Rich Markdown', required: true },
        { id: 'f23', name: 'Reference catalog', type: 'Enum Select', required: false },
        { id: 'f24', name: 'Total weight kg', type: 'Short Text', required: false },
      ]
    },
  ]);

  // Form states - Schema
  const [typeName, setTypeName] = useState('');
  const [typeDesc, setTypeDesc] = useState('');
  const [typeFields, setTypeFields] = useState<ContentField[]>([
    { id: 'init_f', name: 'Title / Headline', type: 'Short Text', required: true }
  ]);

  // Field construction state
  const [activeEditingSchema, setActiveEditingSchema] = useState<ContentType | null>(null);
  const [fieldCandidateName, setFieldCandidateName] = useState('');
  const [fieldCandidateType, setFieldCandidateType] = useState<ContentField['type']>('Short Text');
  const [fieldCandidateRequired, setFieldCandidateRequired] = useState(false);

  const createNewType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeName.trim()) return;

    const slug = typeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newType: ContentType = {
      id: 'type_' + Math.floor(Math.random() * 1000).toString(),
      name: typeName,
      slug,
      desc: typeDesc || 'Custom schema model representing user structured layouts.',
      fieldsCount: typeFields.length,
      status: 'Draft',
      fields: [...typeFields]
    };

    setContentTypes([...contentTypes, newType]);
    setTypeName('');
    setTypeDesc('');
    setTypeFields([{ id: 'init_f', name: 'Title / Headline', type: 'Short Text', required: true }]);
  };

  const addFieldToDraft = () => {
    if (!fieldCandidateName.trim()) return;

    const newField: ContentField = {
      id: 'field_' + Math.floor(Math.random() * 1000).toString(),
      name: fieldCandidateName,
      type: fieldCandidateType,
      required: fieldCandidateRequired
    };

    setTypeFields([...typeFields, newField]);
    setFieldCandidateName('');
    setFieldCandidateType('Short Text');
    setFieldCandidateRequired(false);
  };

  const removeFieldFromDraft = (id: string) => {
    setTypeFields(typeFields.filter(f => f.id !== id));
  };

  const deleteType = (id: string) => {
    setContentTypes(contentTypes.filter(t => t.id !== id));
    if (activeEditingSchema?.id === id) {
      setActiveEditingSchema(null);
    }
  };

  return (
    <div className="space-y-8 text-left" id="content-types-workspace">
      
      {/* Page Header */}
      <div className="border-b border-brand-border pb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl sm:text-2xl text-text-primary tracking-tight">
            Structure & <span className="font-normal italic text-brand-secondary">Content Types</span>
          </h1>
          <p className="text-2xs sm:text-xs font-mono text-text-muted mt-1 leading-relaxed">
            {"// Configure functional layout models and relational schema attributes"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Create a new Schema database */}
        <div className="lg:col-span-5 bg-brand-surface border border-brand-border rounded-xl p-5 sm:p-6 shadow-xs space-y-5" id="design-schema-module">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block border-b border-brand-border pb-2.5 font-bold">
            Assemble Content Layout Model
          </span>

          <form onSubmit={createNewType} className="space-y-5">
            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="schema-name-input">Schema Descriptor Name</label>
              <input 
                id="schema-name-input"
                type="text" 
                placeholder="e.g. Products specs, Articles..." 
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                required
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            <div>
              <label className="block text-2xs font-mono text-text-secondary mb-1.5" htmlFor="schema-desc-input">Model Description</label>
              <input 
                id="schema-desc-input"
                type="text" 
                placeholder="Optional explanation showing collaborator contexts..." 
                value={typeDesc}
                onChange={(e) => setTypeDesc(e.target.value)}
                className="w-full text-xs font-mono bg-brand-surface-soft border border-brand-border rounded-lg px-3.5 py-3 text-text-primary focus:outline-none focus:border-brand-accent"
              />
            </div>

            {/* Fields design shelf */}
            <div className="space-y-3.5 border-t border-brand-border pt-4">
              <span className="block text-2xs font-mono text-text-secondary mb-1.5">Field Struct Specifications ({typeFields.length})</span>
              
              {/* Draft field rows listed */}
              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {typeFields.map((field) => (
                  <div key={field.id} className="flex items-center justify-between bg-brand-surface-soft border border-brand-border px-3 py-2 rounded-lg text-2xs font-mono">
                    <div className="flex items-center gap-2">
                      <Type className="w-3.5 h-3.5 text-brand-secondary" />
                      <strong className="text-text-primary font-bold">{field.name}</strong>
                      <span className="text-text-muted uppercase text-[9px] font-semibold">({field.type})</span>
                      {field.required && (
                        <span className="text-[8px] font-bold text-brand-accent select-none">* REQUIRED</span>
                      )}
                    </div>
                    {field.id !== 'init_f' && (
                      <button 
                        type="button" 
                        onClick={() => removeFieldFromDraft(field.id)}
                        className="text-text-muted hover:text-status-error cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Field Append Builder Box */}
              <div className="bg-brand-surface-soft/60 border border-brand-border rounded-lg p-3.5 space-y-3">
                <input 
                  type="text" 
                  placeholder="Insert field identifier (slug format)" 
                  value={fieldCandidateName}
                  onChange={(e) => setFieldCandidateName(e.target.value)}
                  className="w-full text-2xs font-mono bg-brand-surface border border-brand-border rounded p-2 text-text-primary"
                />

                <div className="flex gap-2 items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-[9px]">
                    <span className="text-text-muted">Type:</span>
                    <select
                      value={fieldCandidateType}
                      onChange={(e) => setFieldCandidateType(e.target.value as any)}
                      className="bg-brand-surface border border-brand-border rounded-md px-1.5 py-1 text-text-primary outline-hidden font-bold cursor-pointer"
                    >
                      <option value="Short Text">Short text string</option>
                      <option value="Rich Markdown">Rich Markdown block</option>
                      <option value="Asset Image">Asset CDN image</option>
                      <option value="UTC Date">UTC Date key</option>
                      <option value="Enum Select">Enum dropdown</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-1.5 font-mono text-[9px] text-text-secondary cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={fieldCandidateRequired}
                      onChange={(e) => setFieldCandidateRequired(e.target.checked)}
                      className="rounded border-brand-border text-brand-accent cursor-pointer focus:ring-0" 
                    />
                    Required?
                  </label>
                </div>

                <button
                  type="button"
                  onClick={addFieldToDraft}
                  disabled={!fieldCandidateName.trim()}
                  className="w-full text-center py-1.5 border border-dashed border-brand-border hover:border-brand-accent font-mono text-3xs font-bold text-text-secondary hover:text-brand-accent cursor-pointer transition-colors block"
                >
                  + Add field specification to draft
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={!typeName.trim() || typeFields.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-accent hover:bg-brand-accent-hover text-white disabled:bg-gray-400 border border-brand-border-button font-mono font-bold text-2xs py-3 rounded-lg neo-shadow cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4 text-white" />
                Compile Schematic Model
              </button>
            </div>
          </form>

        </div>

        {/* Right Side: Active registered schemas checklist */}
        <div className="lg:col-span-7 space-y-4" id="schema-manifest-pane">
          <span className="text-[11px] font-mono tracking-wider text-text-secondary block px-1 font-bold">
            Active Registered Models ({contentTypes.length})
          </span>

          <div className="space-y-4" id="content-types-list">
            {contentTypes.map((type) => (
              <div 
                key={type.id}
                className="bg-brand-surface border border-brand-border hover:border-brand-accent/30 p-5 rounded-xl text-left shadow-xs space-y-4 transition-all"
                id={`model-card-${type.slug}`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono text-brand-secondary font-semibold select-none">Data Model Entry</span>
                    <h3 className="font-display font-bold text-base text-text-primary tracking-tight leading-none">{type.name}</h3>
                    <div className="flex items-center gap-1.5 text-3xs font-mono text-text-muted mt-1 leading-none">
                      <span className="bg-brand-surface-soft border border-brand-border text-text-primary px-1.5 py-0.2 rounded font-bold">slug: {type.slug}</span>
                      <span>•</span>
                      <strong className="text-text-secondary">{type.fieldsCount} Fields registered</strong>
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveEditingSchema(activeEditingSchema?.id === type.id ? null : type)}
                      className="p-1.5 px-3 border border-brand-border rounded-lg bg-brand-surface hover:bg-brand-surface-soft text-2xs font-mono font-semibold text-text-secondary cursor-pointer leading-none flex items-center gap-1 shrink-0"
                    >
                      Inspect fields
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${activeEditingSchema?.id === type.id ? 'rotate-90' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteType(type.id)}
                      className="p-1.5 border border-brand-border bg-brand-surface hover:bg-status-error/10 hover:text-status-error text-text-muted rounded cursor-pointer transition-colors shrink-0"
                      title="Delete Schema"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-2xs sm:text-xs text-text-secondary leading-relaxed font-light">{type.desc}</p>

                {/* Sub expansion fields of selected model */}
                <AnimatePresence>
                  {activeEditingSchema?.id === type.id && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden border-t border-brand-border pt-4 mt-2"
                      id={`fields-expansion-${type.slug}`}
                    >
                      <h4 className="text-[9px] font-mono font-bold text-text-muted uppercase mb-2">Registered Field specifications:</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs font-mono">
                        {type.fields.map((field) => (
                          <div key={field.id} className="p-2 border border-brand-border/60 bg-brand-surface-soft/40 rounded flex items-center justify-between text-left">
                            <span className="font-semibold text-text-primary font-bold">{field.name}</span>
                            <span className="text-[9px] text-[#424d45] font-bold uppercase select-none">[{field.type}]</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          <div className="bg-brand-surface border border-brand-border p-4 sm:p-5 rounded-xl shadow-xs text-left">
            <h4 className="text-2xs font-mono font-bold text-text-primary uppercase mb-1 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-brand-accent" />
              Dynamic REST inking schemas
            </h4>
            <p className="text-[11px] text-text-secondary font-light leading-relaxed">
              Whenever a schematic model is declared on the Wriven dashboard, our API routers compile separate TypeScript typings and deliver REST payloads dynamically. Use structured models to prevent validation errors at fetch times.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
