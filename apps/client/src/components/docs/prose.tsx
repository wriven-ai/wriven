import type { ReactNode } from 'react';
import Link from 'next/link';

/** Shared typographic primitives for docs pages. Server components (no hooks). */

export function DocTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display text-3xl font-medium tracking-tight text-text-primary sm:text-4xl">
      {children}
    </h1>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-sm font-light leading-relaxed text-text-secondary">
      {children}
    </p>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-10 mb-3 border-b border-brand-border pb-2 font-display text-xl font-bold text-text-primary"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 font-mono text-xs font-bold uppercase tracking-tight text-text-primary">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-sm font-light leading-relaxed text-text-secondary">
      {children}
    </p>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-brand-border bg-brand-surface-soft px-1.5 py-0.5 font-mono text-[11px] text-brand-secondary">
      {children}
    </code>
  );
}

export function Callout({
  type = 'info',
  title,
  children,
}: {
  type?: 'info' | 'warning';
  title?: string;
  children: ReactNode;
}) {
  const accent =
    type === 'warning' ? 'border-amber-600' : 'border-brand-accent';
  return (
    <div
      className={`my-4 rounded-lg border-l-4 ${accent} bg-brand-surface-soft p-4 text-xs font-light leading-relaxed text-text-secondary`}
    >
      {title ? (
        <strong className="mb-1 block font-mono text-[11px] font-bold text-brand-accent">
          {title}
        </strong>
      ) : null}
      {children}
    </div>
  );
}

export function NextLink({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="mt-10 inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface px-4 py-3 font-mono text-xs font-bold text-text-primary transition-colors hover:border-brand-accent"
    >
      {title}
      <span aria-hidden>→</span>
    </Link>
  );
}

/** Simple params/response table. */
export function ParamTable({
  rows,
}: {
  rows: { name: string; type: string; desc: string }[];
}) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-brand-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-brand-surface-soft font-mono text-[10px] uppercase tracking-wider text-text-muted">
          <tr>
            <th className="px-3 py-2 font-bold">Param</th>
            <th className="px-3 py-2 font-bold">Type</th>
            <th className="px-3 py-2 font-bold">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {rows.map((r) => (
            <tr key={r.name} className="align-top">
              <td className="px-3 py-2 font-mono text-[11px] font-bold text-brand-secondary">
                {r.name}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-text-muted">
                {r.type}
              </td>
              <td className="px-3 py-2 font-light text-text-secondary">
                {r.desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
