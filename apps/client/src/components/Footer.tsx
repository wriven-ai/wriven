import React from 'react';
import Link from 'next/link';
import WrivenLogo from './WrivenLogo';
import { Send, Github, Twitter, Linkedin, Sparkles } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const productLinks = [
    { name: 'AI Features', href: '/#features' },
    { name: 'Pricing Plans', href: '/pricing' },
    { name: 'Developer Docs', href: '/docs' },
    { name: 'Sandbox Demo', href: '/#sandbox' },
    { name: 'API Reference', href: '/docs' },
  ];

  const companyLinks = [
    { name: 'About Us', href: '/about' },
    { name: 'Company Blog', href: '/blog' },
    { name: 'Contact Sales', href: '/contact' },
    { name: 'Careers', href: '/about#careers' },
    { name: 'Press Kit', href: '/about#press' },
  ];

  const legalLinks = [
    { name: 'Privacy Policy', href: '#' },
    { name: 'Terms of Service', href: '#' },
    { name: 'Security Policy', href: '#' },
    { name: 'SLA Guarantee', href: '#' },
  ];

  return (
    <footer 
      className="bg-brand-surface-soft text-text-primary border-t border-brand-border overflow-hidden"
      id="wriven-footer-section"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" id="wriven-footer-inner">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4" id="footer-links-grid">
          {/* Logo and Newsletter */}
          <div className="space-y-6 lg:col-span-1" id="footer-brand-column">
            <Link href="/" className="inline-block" id="footer-logo-link">
              <WrivenLogo />
            </Link>
            
            <p className="text-xs text-text-secondary leading-relaxed max-w-xs" id="footer-brand-tagline">
              The AI-native headless content engine. Weave structured content effortlessly with state-of-the-art models and deliver secure JSON everywhere.
            </p>

            <div className="flex gap-4" id="footer-social-icons">
              <a href="#" className="text-text-muted hover:text-brand-accent transition-colors" aria-label="Twitter">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="text-text-muted hover:text-brand-accent transition-colors" aria-label="LinkedIn">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href="#" className="text-text-muted hover:text-brand-accent transition-colors" aria-label="GitHub">
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Product links */}
          <div id="footer-product-links-col">
            <h3 className="text-xs font-mono font-bold tracking-wider text-brand-accent uppercase" id="footer-header-product">
              Product
            </h3>
            <ul role="list" className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-xs text-text-secondary hover:text-brand-accent transition-colors duration-150">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div id="footer-company-links-col">
            <h3 className="text-xs font-mono font-bold tracking-wider text-brand-accent uppercase" id="footer-header-company">
              Company
            </h3>
            <ul role="list" className="mt-4 space-y-2.5">
              {companyLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-xs text-text-secondary hover:text-brand-accent transition-colors duration-150">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter / CTA */}
          <div className="space-y-4" id="footer-newsletter-col">
            <h3 className="text-xs font-mono font-bold tracking-wider text-brand-accent uppercase" id="footer-header-newsletter">
              Stay Connected
            </h3>
            <p className="text-xs text-text-secondary">
              Get our monthly product newsletter and developer tips.
            </p>
            <form onSubmit={(e) => e.preventDefault()} className="flex max-w-sm gap-2" id="footer-newsletter-form">
              <label htmlFor="footer-subscribe-email" className="sr-only">Email address</label>
              <input
                id="footer-subscribe-email"
                type="email"
                required
                placeholder="you@email.com"
                className="w-full text-xs font-mono rounded-lg bg-brand-surface border border-brand-border px-3.5 py-2 text-text-primary placeholder-text-muted focus:border-brand-accent focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-brand-accent px-4 py-2 hover:bg-brand-accent-hover transition-colors text-white"
                aria-label="Subscribe"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-brand-border flex flex-col md:flex-row items-center justify-between gap-6" id="footer-legal-bar">
          <p className="text-xs text-text-muted" id="footer-copyright">
            &copy; {currentYear} Wriven, Inc. All rights reserved. Write once. Weave everywhere.
          </p>
          <div className="flex gap-6 flex-wrap justify-center" id="footer-legal-links">
            {legalLinks.map((link) => (
              <a key={link.name} href={link.href} className="text-xs text-text-muted hover:text-brand-accent transition-colors">
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
