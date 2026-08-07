'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { ReactNode, useState } from 'react';

export type SwitcherItem = { id: string; name: string; slug: string };

type ScopeSwitcherProps = {
  /** Currently active entity, or null when none is selected. */
  current: SwitcherItem | null;
  items: SwitcherItem[];
  onSelect: (item: SwitcherItem) => void;
  onCreate: () => void;
  icon?: ReactNode;
  placeholder?: string;
  badge?: string;
  titleHref?: string;
  /** 'breadcrumb' = compact (top bar); 'block' = full-width row (sidebar top). */
  variant?: 'breadcrumb' | 'block';
  createLabel: string;
  emptyText?: string;
};

/**
 * Supabase/Sanity-style switcher. The trigger is split: the NAME navigates to
 * the entity's overview, the CHEVRON opens a short list + "create new". No
 * search — the lists are small. Domain-agnostic; workspace/project switchers wrap it.
 */
export function ScopeSwitcher({
  current,
  items,
  onSelect,
  onCreate,
  icon,
  placeholder = 'Select…',
  badge,
  titleHref,
  variant = 'breadcrumb',
  createLabel,
  emptyText = 'Nothing yet.',
}: ScopeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const block = variant === 'block';

  const pick = (item: SwitcherItem) => {
    setOpen(false);
    if (item.slug !== current?.slug) onSelect(item);
  };

  const nameInner = (
    <>
      {icon ? (
        <span
          className={cn(
            'shrink-0 text-text-muted',
            block &&
              'flex h-6 w-6 items-center justify-center rounded-md bg-brand-accent/10 text-brand-accent',
          )}
        >
          {icon}
        </span>
      ) : null}
      <span
        className={cn('truncate font-bold', block ? 'flex-1' : 'max-w-[12rem]')}
      >
        {current?.name ?? placeholder}
      </span>
      {badge ? (
        <span className="inline-flex items-center leading-none shrink-0 rounded border border-brand-border bg-brand-surface-soft px-1 py-0.5 text-[10px] font-bold tracking-wider text-text-secondary dark:text-text-primary uppercase">
          {badge}
        </span>
      ) : null}
    </>
  );

  const nameClass = cn(
    'flex items-center gap-1.5 font-mono text-sm text-text-primary transition-all cursor-pointer',
    block
      ? 'flex-1 min-w-0 gap-2 rounded-l-lg px-2.5 py-2 hover:bg-brand-surface-soft'
      : 'rounded-md px-2 py-1 hover:bg-brand-surface-soft border border-transparent hover:border-brand-border',
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'flex items-center',
          block
            ? 'w-full rounded-lg border border-brand-border bg-brand-surface-soft/40'
            : 'gap-0.5',
        )}
      >
        {/* NAME → navigates */}
        {titleHref ? (
          <Link href={titleHref} className={nameClass}>
            {nameInner}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={nameClass}
          >
            {nameInner}
          </button>
        )}

        {/* CHEVRON → opens dropdown */}
        <PopoverTrigger
          aria-label="Open switcher"
          className={cn(
            'flex items-center justify-center text-text-muted transition-all cursor-pointer hover:text-text-primary',
            block
              ? 'rounded-r-lg border-l border-brand-border px-2 py-2 hover:bg-brand-surface-soft'
              : 'rounded-md p-1 hover:bg-brand-surface-soft data-popup-open:bg-brand-surface-soft',
          )}
        >
          <ChevronsUpDown className="h-3 w-3" />
        </PopoverTrigger>
      </div>

      <PopoverContent
        align={block ? 'end' : 'start'}
        className="w-60 gap-0 border border-brand-border bg-brand-surface p-1 text-text-primary shadow-lg ring-0"
      >
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-2.5 py-3 text-center font-mono text-sm text-text-muted">
              {emptyText}
            </p>
          ) : (
            items.map((item) => {
              const active = item.slug === current?.slug;
              return (
                <button
                  key={item.id}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-sm',
                    'hover:bg-brand-surface-soft transition-colors cursor-pointer',
                    active && 'bg-brand-surface-soft',
                  )}
                >
                  <span className="truncate text-text-primary">
                    {item.name}
                  </span>
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-brand-accent shrink-0" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="mt-1 border-t border-brand-border pt-1">
          <button
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-mono text-sm text-text-secondary hover:bg-brand-surface-soft hover:text-brand-accent transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            {createLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
