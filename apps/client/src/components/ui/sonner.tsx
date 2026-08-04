'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Wriven-themed Sonner toaster (shadcn's toast). Styled with brand tokens +
 * `neo-shadow` + the mono typeface so it reads as part of the dashboard /
 * marketing surfaces rather than Sonner's default chrome. Per-type accents are
 * a left hairline stripe (success/error/...) — body stays `brand-surface`.
 * See `global.css` for the token definitions.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-right"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-brand-border-button bg-brand-surface p-4 neo-shadow font-mono text-2xs',
          title: 'text-text-primary font-bold tracking-tight',
          description: 'text-text-secondary font-light',
          actionButton: 'bg-brand-accent hover:bg-brand-accent-hover text-white',
          cancelButton: 'bg-brand-surface-soft text-text-secondary',
          closeButton:
            'bg-brand-surface border-brand-border text-text-muted hover:text-text-primary',
          success: 'border-l-2 border-l-status-success',
          error: 'border-l-2 border-l-status-error',
          warning: 'border-l-2 border-l-brand-secondary',
          info: 'border-l-2 border-l-brand-secondary',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
