import Image from 'next/image';
import darkLogo from '@/assets/wriven-dark-logo.png';
import lightLogo from '@/assets/wriven-light-logo.png';

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
  /** Wordmark only — no PNG mark (tight spaces, e.g. auth chrome on mobile). */
  textOnly?: boolean;
  /** Rendered height of the mark in px (the glyph is a fixed 2:1 aspect). */
  iconSize?: number;
}

/**
 * Brand lockup: PNG mark + typographic "Wriven". Theme-aware with pure CSS —
 * both PNGs render (hidden via `dark:` classes since next-themes toggles
 * `class="dark"` on `<html>`), so the correct mark paints server-side with no
 * flash and no hydration work. Both PNGs are normalized to the same 2:1 canvas
 * so the theme swap causes no layout shift.
 */
export default function WrivenLogo({
  className = '',
  iconOnly = false,
  textOnly = false,
  iconSize = 28,
}: LogoProps) {
  return (
    <div
      className={`flex items-center gap-2.5 select-none ${className}`}
      id="wriven-logo-container"
    >
      {!textOnly && (
        <>
          <Image
            src={darkLogo}
            alt="Wriven"
            width={iconSize * 2}
            height={iconSize}
            priority
            className="shrink-0 dark:hidden"
          />
          <Image
            src={lightLogo}
            alt=""
            aria-hidden
            width={iconSize * 2}
            height={iconSize}
            priority
            className="hidden shrink-0 dark:block"
          />
        </>
      )}
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
