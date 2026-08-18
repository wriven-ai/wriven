'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import darkLogo from '@/assets/wriven-dark-logo.png';
import lightLogo from '@/assets/wriven-light-logo.png';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  /** Rendered height of the mark in px (the glyph is a fixed 2:1 aspect). */
  iconSize?: number;
}

/**
 * Brand lockup: PNG mark + typographic "Wriven". Theme-aware — navy-ink mark
 * on light surfaces, light-ink mark on dark ones. Both PNGs are normalized to
 * the same 2:1 canvas so the theme swap causes no layout shift.
 */
export default function WrivenLogo({
  className = '',
  iconOnly = false,
  iconSize = 28,
}: LogoProps) {
  const { resolvedTheme } = useTheme();

  // next-themes resolves on the client only — paint the light-theme (navy)
  // mark during SSR/first render, then swap once the theme is known.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const logo = mounted && resolvedTheme === 'dark' ? lightLogo : darkLogo;

  return (
    <div
      className={`flex items-center gap-2.5 select-none ${className}`}
      id="wriven-logo-container"
    >
      <Image
        src={logo}
        alt="Wriven"
        width={iconSize * 2}
        height={iconSize}
        priority
        className="shrink-0"
      />
      {!iconOnly && (
        <span
          className="font-display text-xl font-bold tracking-tight text-text-primary flex items-baseline gap-0.5"
          id="wriven-logo-text"
        >
          Wriven
          <span className="w-1.5 h-1.5 rounded-full bg-brand-accent inline-block"></span>
        </span>
      )}
    </div>
  );
}
