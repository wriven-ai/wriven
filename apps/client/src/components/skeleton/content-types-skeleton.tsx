'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  TableCell,
  TableRow,
} from '@/components/ui/table';

/**
 * Content-types page loading skeleton. Mirrors the list table: one placeholder
 * row per content type while the query is in flight.
 */

/** Skeleton rows for the content-types table body. */
export function ContentTypeRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} aria-hidden>
          <TableCell className="pl-5">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="h-3 w-20" /></TableCell>
          <TableCell><Skeleton className="h-3 w-8" /></TableCell>
          <TableCell className="text-right pr-5">
            <div className="flex items-center justify-end gap-1.5">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
