"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  const getVisiblePages = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    if (currentPage > 3) pages.push("ellipsis");

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) pages.push(i);

    if (currentPage < totalPages - 2) pages.push("ellipsis");

    pages.push(totalPages);

    return pages;
  };

  const pages = getVisiblePages();

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between gap-4 pt-4 border-t border-brand-border",
        className
      )}
    >
      <p className="hidden sm:block font-mono text-sm text-text-muted">
        Page {currentPage} of {totalPages}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Go to previous page"
          className={cn(
            "inline-flex items-center justify-center size-9 sm:size-7 rounded-md border border-brand-border bg-brand-surface transition-colors",
            "hover:bg-brand-surface-soft hover:border-brand-accent/50",
            "disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-brand-surface disabled:hover:border-brand-border"
          )}
        >
          <ChevronLeft className="size-3.5 text-text-secondary" />
        </button>

        {pages.map((page, idx) =>
          page === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="inline-flex items-center justify-center size-7 text-text-muted"
            >
              <MoreHorizontal className="size-3.5" />
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              aria-label={`Go to page ${page}`}
              aria-current={currentPage === page ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center size-9 sm:size-7 rounded-md border font-mono text-sm font-bold transition-colors",
                currentPage === page
                  ? "bg-brand-accent text-white border-brand-accent"
                  : "bg-brand-surface text-text-secondary border-brand-border hover:bg-brand-surface-soft hover:border-brand-accent/50"
              )}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Go to next page"
          className={cn(
            "inline-flex items-center justify-center size-9 sm:size-7 rounded-md border border-brand-border bg-brand-surface transition-colors",
            "hover:bg-brand-surface-soft hover:border-brand-accent/50",
            "disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-brand-surface disabled:hover:border-brand-border"
          )}
        >
          <ChevronRight className="size-3.5 text-text-secondary" />
        </button>
      </div>
    </nav>
  );
}

export { Pagination };
