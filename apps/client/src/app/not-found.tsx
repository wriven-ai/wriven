import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-text-primary editorial-grid relative paper-grain">
      <Header />

      <main className="flex-grow flex items-center justify-center py-24 relative z-10">
        <div className="mx-auto max-w-xl px-4 sm:px-6 text-center space-y-6">
          <span className="text-sm font-semibold tracking-wider text-brand-secondary uppercase animate-fade-in">
            404 — Not Found
          </span>
          <h1
            className="font-display font-medium leading-tight tracking-tight text-text-primary text-4xl sm:text-5xl"
            id="not-found-title"
          >
            This thread came loose
          </h1>
          <p className="text-text-secondary text-sm sm:text-base leading-relaxed font-light">
            The page you are looking for does not exist or has been unpublished.
            The link may be outdated — try the blog index or head back home.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-3">
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-accent hover:bg-brand-accent-hover text-white border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-lg neo-shadow-lg"
            >
              Back to home
            </Link>
            <Link
              href="/blog"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-surface-soft hover:bg-brand-border text-text-primary border border-brand-border-button font-mono font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-lg"
            >
              Browse the blog
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
