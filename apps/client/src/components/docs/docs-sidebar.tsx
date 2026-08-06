'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOCS_NAV } from './docs-nav';

/** Persistent docs navigation. Highlights the current route via usePathname. */
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-7">
      {DOCS_NAV.map((group) => (
        <div key={group.label}>
          <h4 className="mb-2 px-3 font-mono text-sm font-bold uppercase tracking-widest text-text-muted">
            {group.label}
          </h4>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 font-mono text-sm transition-colors ${
                      active
                        ? 'bg-brand-accent font-bold text-white'
                        : 'text-text-secondary hover:bg-brand-surface-soft hover:text-text-primary'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.title}</span>
                    {item.badge ? (
                      <span className="ml-auto rounded bg-brand-surface-soft px-1 font-mono text-sm uppercase text-text-muted">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
