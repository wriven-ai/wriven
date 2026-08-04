import type { ReactNode } from 'react';
import Footer from '../../components/Footer';
import Header from '../../components/Header';
import { DocsSidebar } from '../../components/docs/docs-sidebar';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-bg text-text-primary">
      <Header />

      <div className="mx-auto w-full max-w-7xl flex-grow px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-8">
            <DocsSidebar />
          </aside>

          <main className="min-w-0 max-w-3xl">{children}</main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
