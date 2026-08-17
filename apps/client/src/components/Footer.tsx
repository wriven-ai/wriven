'use client';

import Link from 'next/link';
import WrivenLogo from './WrivenLogo';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  // External links (full origin) open in a new tab; the rest use next/link.
  const productLinks: { name: string; href: string; external?: boolean }[] = [
    { name: 'AI Features', href: '/#features' },
    { name: 'Pricing Plans', href: '/pricing' },
    { name: 'Developer Docs', href: '/docs' },
    { name: 'Sandbox Demo', href: '/#sandbox' },
    { name: 'API Reference', href: '/docs/delivery-api' },
    { name: 'Demo Contents', href: 'https://content.wriven.tech', external: true },
  ];

  const companyLinks = [
    { name: 'About Us', href: '/about' },
    { name: 'Company Blog', href: '/blog' },
    { name: 'Contact Sales', href: '/contact' },
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
          </div>

          {/* Product links */}
          <div id="footer-product-links-col">
            <h3 className="text-sm font-mono font-bold tracking-wider text-brand-accent uppercase" id="footer-header-product">
              Product
            </h3>
            <ul role="list" className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm text-text-secondary hover:text-brand-accent transition-colors duration-150">
                      {link.name}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-sm text-text-secondary hover:text-brand-accent transition-colors duration-150">
                      {link.name}
                    </Link>
                  )}
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

        <div className="mt-16 pt-8 border-t border-brand-border flex flex-col items-center gap-6" id="footer-legal-bar">
          <p className="text-sm text-text-muted" id="footer-copyright">
            &copy; {currentYear} Wriven, Inc. All rights reserved. Write once. Weave everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
