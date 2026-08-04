'use client';

import type { ReactNode } from 'react';

/** Single toolbar control. Mouse-down preventDefault keeps the editor focused. */
export function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors disabled:opacity-40 ${
        active
          ? 'bg-brand-accent text-white'
          : 'text-text-secondary hover:bg-brand-surface hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
