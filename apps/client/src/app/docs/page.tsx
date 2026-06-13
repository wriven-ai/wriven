'use client';

import React, { useState } from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { BookOpen, Terminal, Code, FileCode, Check, Copy } from 'lucide-react';

export default function Docs() {
  const [activeSection, setActiveSection] = useState<'quick-start' | 'rest-api' | 'graphql-api' | 'nextjs-example'>('quick-start');
  const [copiedText, setCopiedText] = useState(false);

  const sidebarItems = [
    { id: 'quick-start', name: 'Quick Start', icon: BookOpen },
    { id: 'rest-api', name: 'REST API', icon: Terminal },
    { id: 'graphql-api', name: 'GraphQL Query', icon: Code },
    { id: 'nextjs-example', name: 'Next.js App', icon: FileCode },
  ];

  const codeSnippets = {
    auth: `// Initialize Wriven content inking client module
import { createWrivenClient } from '@wriven/client';

const wriven = createWrivenClient({
  workspace: "acme-corp",
  token: process.env.WRIVEN_API_TOKEN
});`,
    rest: `// Query published articles filtered by category
const response = await fetch(
  "https://cdn.wriven.io/v1/spaces/acme-corp/collections/blog_post/entries?status=published",
  {
    headers: {
      "Authorization": "Bearer wvn_hk_99a81c..."
    }
  }
);
const data = await response.json();
console.log(data.fields.title);`,
    graphql: `query GetArticles {
  space(id: "acme-corp") {
    collection(id: "blog_post", status: PUBLISHED) {
      entries {
        id
        slug
        fields {
          title
          generated_content
        }
      }
    }
  }
}`,
    nextjs: `// app/blog/page.tsx - Server Component
import { createWrivenClient } from '@wriven/client';

export default async function BlogPage() {
  const wriven = createWrivenClient({
    workspace: "acme-corp",
    token: process.env.WRIVEN_API_TOKEN
  });

  const articles = await wriven.getCollection('blog_post');

  return (
    <main className="max-w-4xl mx-auto py-12">
      <h1 className="text-3xl font-bold font-serif">{articles[0].fields.title}</h1>
      <article className="mt-6 prose text-gray-800">
        {articles[0].fields.generated_content}
      </article>
    </main>
  );
}`
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain" id="wriven-docs-page">
      <Header />

      <main className="flex-grow py-12 sm:py-16 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12" id="docs-layout-grid">
            {/* Sidebar Navigation */}
            <aside className="lg:col-span-3 space-y-6" id="docs-sidebar">
              <div className="bg-brand-surface border border-brand-border-button rounded-xl p-5 shadow-2xl neo-shadow text-left">
                <h3 className="text-xs font-semibold uppercase text-brand-secondary mb-4 tracking-wide">Contents</h3>
                <nav className="flex flex-col gap-2" id="docs-nav">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id as any)}
                        className={`w-full text-left font-mono font-bold text-[10px] tracking-wider px-3.5 py-3 rounded-lg transition-all cursor-pointer ${
                          activeSection === item.id
                          ? 'bg-brand-accent text-white border border-brand-border-button'
                          : 'text-text-secondary hover:bg-brand-surface-soft border border-transparent hover:border-brand-border'
                        }`}
                        id={`docs-btn-${item.id}`}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4 shrink-0" />
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            {/* Document Content Viewport */}
            <section className="lg:col-span-9 bg-brand-surface border border-brand-border-button rounded-xl p-6 sm:p-10 shadow-2xl neo-shadow-lg text-left" id="docs-viewport">
              
              {activeSection === 'quick-start' && (
                <div className="space-y-6" id="docs-section-start">
                  <h1 className="font-display font-medium text-text-primary text-3xl sm:text-4xl">Developer Quick Start</h1>
                  <p className="text-text-secondary text-sm font-light leading-relaxed">
                    Welcome to the Wriven content engine guidelines. In less than three minutes, establish secure access keys, integrate copywriter modules, and query published structured models.
                  </p>

                  <h3 className="font-display font-bold text-sm text-text-primary font-mono uppercase tracking-tight">{"// AUTHENTICATE CORES"}</h3>
                  <div className="relative rounded-lg bg-text-primary text-brand-surface-soft p-5 font-mono text-xs overflow-x-auto max-w-full border border-brand-border-button">
                    <button
                      onClick={() => handleCopyCode(codeSnippets.auth)}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-[#444] hover:bg-[#333] rounded border border-white/5 transition-colors text-white"
                      title="Copy code"
                    >
                      {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre className="pr-8">{codeSnippets.auth}</pre>
                  </div>

                  <div className="p-5 rounded-lg border-l-4 border-amber-600 bg-brand-surface-soft text-xs sm:text-sm text-text-secondary leading-relaxed font-light">
                    <strong className="block text-brand-accent font-bold mb-1 font-mono">{"// SECURITY WARNING //"}</strong>
                    Keep your API tokens fully private. Always leverage server-side fetch routines or secure environment variables rather than exposing pure authorization strings in static browser JavaScript.
                  </div>
                </div>
              )}

              {activeSection === 'rest-api' && (
                <div className="space-y-6" id="docs-section-rest">
                  <h1 className="font-display font-medium text-text-primary text-3xl sm:text-4xl">REST Delivery API</h1>
                  <p className="text-text-secondary text-sm font-light leading-relaxed">
                    Wriven&apos;s REST nodes return JSON records. Query entries targeted by model namespace, author attributes, custom categories, or route slugs.
                  </p>

                  <h3 className="font-display font-bold text-sm text-text-primary font-mono uppercase tracking-tight">{"// FETCH ENTRY SPEC (JAVASCRIPT)"}</h3>
                  <div className="relative rounded-lg bg-text-primary text-brand-surface-soft p-5 font-mono text-xs overflow-x-auto max-w-full border border-brand-border-button">
                    <button
                      onClick={() => handleCopyCode(codeSnippets.rest)}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-[#444] hover:bg-[#333] rounded border border-white/5 transition-colors text-white"
                      title="Copy code"
                    >
                      {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre className="pr-8">{codeSnippets.rest}</pre>
                  </div>
                </div>
              )}

              {activeSection === 'graphql-api' && (
                <div className="space-y-6" id="docs-section-graphql">
                  <h1 className="font-display font-medium text-text-primary text-3xl sm:text-4xl">GraphQL Queries</h1>
                  <p className="text-text-secondary text-sm font-light leading-relaxed">
                    Prevent high client overheads and payload sizes. Request precise fields and relations with elegant GraphQL descriptors.
                  </p>

                  <div className="relative rounded-lg bg-text-primary text-brand-surface-soft p-5 font-mono text-xs overflow-x-auto max-w-full border border-brand-border-button">
                    <button
                      onClick={() => handleCopyCode(codeSnippets.graphql)}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-[#444] hover:bg-[#333] rounded border border-white/5 transition-colors text-white"
                      title="Copy code"
                    >
                      {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre className="pr-8">{codeSnippets.graphql}</pre>
                  </div>
                </div>
              )}

              {activeSection === 'nextjs-example' && (
                <div className="space-y-6" id="docs-section-nextjs">
                  <h1 className="font-display font-medium text-text-primary text-3xl sm:text-4xl">Next.js Integration</h1>
                  <p className="text-text-secondary text-sm font-light leading-relaxed">
                    We play wonderfully with standard React server elements and incremental caching parameters. Let&apos;s see a basic, fully-typed server component fetching from Wriven.
                  </p>

                  <div className="relative rounded-lg bg-text-primary text-brand-surface-soft p-5 font-mono text-xs overflow-x-auto max-w-full border border-brand-border-button">
                    <button
                      onClick={() => handleCopyCode(codeSnippets.nextjs)}
                      className="absolute top-2.5 right-2.5 p-1.5 bg-[#444] hover:bg-[#333] rounded border border-white/5 transition-colors text-white"
                      title="Copy code"
                    >
                      {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <pre className="pr-8">{codeSnippets.nextjs}</pre>
                  </div>
                </div>
              )}

            </section>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
