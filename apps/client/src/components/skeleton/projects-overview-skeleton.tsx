'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Mirrors the real page markup so loading reads as the same layout; pulses
 * use the token-bound <Skeleton/>. */

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-brand-surface border border-brand-border rounded-xl shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-surface p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-4 shrink-0" />
    </div>
  );
}

/** Project cards grid — 2-up, matches the real layout. */
export function ProjectGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Welcome banner silhouette — matches the real banner shell. */
export function WelcomeBannerSkeleton() {
  return (
    <Card className="p-6 sm:p-8 relative overflow-hidden">
      <div className="relative z-10 max-w-2xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-full max-w-md" />
        <Skeleton className="h-3 w-2/3 max-w-sm" />
      </div>
      <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-gradient-to-l from-brand-secondary/5 to-transparent pointer-events-none select-none" />
    </Card>
  );
}

/**
 * Full workspace-overview page skeleton — the <Suspense> fallback (brief window
 * before the page mounts) and the initial whole-page load. Mirrors the real
 * layout: welcome banner + projects header + project cards grid.
 */
export function ProjectsOverviewSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-hidden>
      <WelcomeBannerSkeleton />

      {/* Projects header + New Project button */}
      <div className="flex items-end justify-between pt-6">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-2.5 w-16" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <ProjectGridSkeleton cards={cards} />
    </div>
  );
}

export default ProjectsOverviewSkeleton;
