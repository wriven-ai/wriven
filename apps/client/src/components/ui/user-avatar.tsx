'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Render a user's avatar via `next/image`, falling back to initials when there
 * is no photo **or** the image fails to load (broken/expired URL). Avoids the
 * raw-`<img>` broken-image icon. Sizes: `size` px (square). Hosts must be
 * registered in `next.config.js` `images.remotePatterns` (specs/18).
 */
export function UserAvatar({
  name,
  src,
  size = 28,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImg = !!src && !errored;
  const initials = (name || '?').slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-md bg-brand-accent font-mono font-bold text-white flex items-center justify-center',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {showImg ? (
        <Image
          src={src}
          alt={name || ''}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}
