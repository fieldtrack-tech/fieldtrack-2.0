import { Skeleton } from "@/components/ui/skeleton";

type LoadingSkeletonVariant = "card" | "table" | "map";

interface LoadingSkeletonProps {
  variant?: LoadingSkeletonVariant;
}

function CardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function MapSkeleton() {
  return <Skeleton className="h-96 w-full rounded-lg" />;
}

export function LoadingSkeleton({ variant = "card" }: LoadingSkeletonProps) {
  if (variant === "table") return <TableSkeleton />;
  if (variant === "map") return <MapSkeleton />;
  return <CardSkeleton />;
}
