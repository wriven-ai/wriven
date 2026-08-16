'use client';

import React from 'react';
import Link from 'next/link';
import WrivenLogo from './WrivenLogo';

// Brand glyphs are not shipped by lucide-react, so they are inlined here.
const Twitter = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const Linkedin = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
  </svg>
);

const Github = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

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
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3" id="footer-links-grid">
          {/* Logo and Newsletter */}
          <div className="space-y-6 lg:col-span-1" id="footer-brand-column">
            <Link href="/" className="inline-block" id="footer-logo-link">
              <WrivenLogo />
            </Link>
            
            <p className="text-sm text-text-secondary leading-relaxed max-w-xs" id="footer-brand-tagline">
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
            <h3 className="text-sm font-mono font-bold tracking-wider text-brand-accent uppercase" id="footer-header-product">
              Product
            </h3>
            <ul role="list" className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-text-secondary hover:text-brand-accent transition-colors duration-150">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div id="footer-company-links-col">
            <h3 className="text-sm font-mono font-bold tracking-wider text-brand-accent uppercase" id="footer-header-company">
              Company
            </h3>
            <ul role="list" className="mt-4 space-y-2.5">
              {companyLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-text-secondary hover:text-brand-accent transition-colors duration-150">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-brand-border flex flex-col md:flex-row items-center justify-between gap-6" id="footer-legal-bar">
          <p className="text-sm text-text-muted" id="footer-copyright">
            &copy; {currentYear} Wriven, Inc. All rights reserved. Write once. Weave everywhere.
          </p>
          <div className="flex gap-6 flex-wrap justify-center" id="footer-legal-links">
            {legalLinks.map((link) => (
              <a key={link.name} href={link.href} className="text-sm text-text-muted hover:text-brand-accent transition-colors">
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
