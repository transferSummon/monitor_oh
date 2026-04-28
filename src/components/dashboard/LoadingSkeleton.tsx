export function SummaryCardSkeleton() {
  return (
    <div className="rounded-lg bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded skeleton-shimmer" />
          <div className="h-8 w-16 rounded skeleton-shimmer" />
          <div className="h-3 w-24 rounded skeleton-shimmer" />
        </div>
        <div className="h-12 w-12 rounded-lg skeleton-shimmer" />
      </div>
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {[...Array(5)].map((_, i) => (
        <SummaryCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function AdCardSkeleton() {
  return (
    <div className="rounded-lg border-l-4 border-l-muted bg-card p-4 shadow-card">
      <div className="space-y-3">
        <div className="h-5 w-3/4 rounded skeleton-shimmer" />
        <div className="h-3 w-1/2 rounded skeleton-shimmer" />
        <div className="flex gap-2">
          <div className="h-5 w-12 rounded-full skeleton-shimmer" />
          <div className="h-5 w-12 rounded-full skeleton-shimmer" />
        </div>
        <div className="flex gap-4">
          <div className="h-4 w-16 rounded skeleton-shimmer" />
          <div className="h-4 w-16 rounded skeleton-shimmer" />
        </div>
        <div className="h-9 w-full rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

export function AdsListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <AdCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <SummaryCardsSkeleton />
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="h-10 w-24 rounded-lg skeleton-shimmer" />
          <div className="h-10 w-24 rounded-lg skeleton-shimmer" />
          <div className="h-10 w-24 rounded-lg skeleton-shimmer" />
        </div>
        <AdsListSkeleton />
      </div>
    </div>
  );
}
