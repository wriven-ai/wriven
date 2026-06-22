'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WrivenLogo from './WrivenLogo';
import { Menu, X, ArrowRight, Sun, Moon } from 'lucide-react';

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTimeout(() => {
      setTheme(isDark ? 'dark' : 'light');
    }, 0);
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('wriven-theme', 'dark');
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('wriven-theme', 'light');
      setTheme('light');
    }
  };

  const navItems = [
    { name: 'Features', href: '/#features' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'About', href: '/about' },
    { name: 'Blog', href: '/blog' },
    { name: 'Docs', href: '/docs' },
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Contact', href: '/contact' },
  ];

  const isActive = (path: string) => {
    if (path.startsWith('/#')) return false; // anchor link
    if (path === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
    return pathname === path;
  };

  return (
    <header 
      className="sticky top-0 z-50 w-full border-b border-brand-border bg-brand-surface/80 backdrop-blur-md transition-all duration-200"
      id="wriven-header"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" id="wriven-header-inner">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center" id="wriven-logo-link">
            <WrivenLogo />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8" id="wriven-desktop-nav">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`text-sm font-medium tracking-wide transition-colors duration-200 hover:text-brand-accent ${
                    active ? 'text-brand-accent font-semibold' : 'text-text-secondary'
                  }`}
                  id={`nav-item-${item.name.toLowerCase()}`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Right actions (Login & Sign Up) */}
          <div className="hidden md:flex items-center gap-3 animate-fade-in" id="wriven-desktop-ctas">
            <button
              onClick={toggleTheme}
              className="p-2 text-text-secondary hover:text-brand-accent transition-all duration-250 rounded-lg hover:bg-brand-surface-soft border border-transparent hover:border-brand-border cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Toggle visual theme"
              id="theme-toggle-desktop"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-500 hover:rotate-12 transition-transform shrink-0" />
              ) : (
                <Moon className="w-4 h-4 text-brand-accent shrink-0" />
              )}
            </button>
            <Link
              href="/login"
              className="text-xs font-mono font-bold uppercase tracking-wider text-text-secondary hover:text-brand-accent transition-colors duration-200 px-3 py-2"
              id="header-login-btn"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 bg-brand-accent text-white border border-brand-border-button hover:bg-brand-accent-hover font-mono font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg neo-shadow transition-all duration-200"
              id="header-signup-btn"
            >
              Get started free
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden" id="wriven-mobile-nav-toggle-container">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              className="inline-flex items-center justify-center rounded-lg p-2 text-text-secondary hover:bg-brand-surface-soft hover:text-text-primary transition-colors duration-150"
              aria-controls="mobile-menu"
              aria-expanded={mobileMenuOpen}
              id="mobile-menu-toggle"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <X className="block h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="block h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu, show/hide based on menu state */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-brand-border bg-brand-surface animate-fade-in" id="mobile-menu">
          <div className="space-y-1 px-4 py-4 sm:px-6">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-brand-surface-soft ${
                  isActive(item.href) ? 'text-brand-accent bg-brand-surface-soft/55' : 'text-text-secondary'
                }`}
                id={`mobile-nav-item-${item.name.toLowerCase()}`}
              >
                {item.name}
              </Link>
            ))}
            <hr className="my-4 border-brand-border" />
            <div className="flex flex-col gap-3 pb-2">
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-text-primary hover:bg-brand-surface-soft transition-colors cursor-pointer border border-brand-border bg-brand-surface"
                id="mobile-nav-theme-toggle"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                    Use warm light
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-brand-accent shrink-0" />
                    Use cozy dark
                  </>
                )}
              </button>
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center rounded-lg px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-text-primary hover:bg-brand-surface-soft transition-colors"
                id="mobile-nav-login"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 bg-brand-accent text-white border border-brand-border-button font-mono font-bold text-xs uppercase tracking-wider py-3 rounded-lg neo-shadow transition-all"
                id="mobile-nav-signup"
              >
                Get started free
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
