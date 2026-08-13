"use client";

import { cn } from "@/lib/utils";

interface WrivenLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
};

function WrivenLoader({ className, size = "md" }: WrivenLoaderProps) {
  return (
    <div
      className={cn("relative", sizeMap[size], className)}
      role="status"
      aria-label="Loading"
    >
      {/* Outer ring - accent emerald */}
      <div
        className="absolute inset-0 rounded-full border-2 border-t-brand-accent border-r-brand-accent/30 border-b-brand-accent/10 border-l-brand-accent/50 animate-spin"
        style={{ animationDuration: "1.2s" }}
      />
      {/* Inner ring - secondary amber, counter-rotate */}
      <div
        className="absolute inset-[3px] rounded-full border-2 border-b-brand-secondary border-l-brand-secondary/30 border-t-brand-secondary/10 border-r-brand-secondary/50 animate-spin"
        style={{ animationDuration: "0.9s", animationDirection: "reverse" }}
      />
      {/* Center dot pulse */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
      </div>
    </div>
  );
}

export { WrivenLoader };
