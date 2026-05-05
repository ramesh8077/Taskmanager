"use client";

/**
 * Skeleton Loader
 *
 * Displays animated placeholder cards while data is being fetched.
 * Prevents blank-screen flash and gives a premium loading UX.
 */

interface SkeletonLoaderProps {
  /** Number of skeleton cards to render */
  count?: number;
  /** Variant style */
  variant?: "card" | "table-row";
}

export default function SkeletonLoader({
  count = 3,
  variant = "card",
}: SkeletonLoaderProps) {
  if (variant === "table-row") {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
          >
            <div className="h-4 w-10 bg-white/[0.06] rounded-md" />
            <div className="h-4 flex-1 bg-white/[0.06] rounded-md" />
            <div className="h-4 w-24 bg-white/[0.06] rounded-md" />
            <div className="h-4 w-20 bg-white/[0.06] rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 animate-pulse"
        >
          {/* Header shimmer */}
          <div className="flex items-center justify-between mb-5">
            <div className="h-5 w-2/5 bg-white/[0.06] rounded-md" />
            <div className="h-6 w-20 bg-white/[0.06] rounded-full" />
          </div>
          {/* Body shimmer */}
          <div className="space-y-3 mb-5">
            <div className="h-3 w-full bg-white/[0.06] rounded-md" />
            <div className="h-3 w-4/5 bg-white/[0.06] rounded-md" />
          </div>
          {/* Footer shimmer */}
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
            <div className="h-3 w-24 bg-white/[0.06] rounded-md" />
            <div className="h-3 w-16 bg-white/[0.06] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
