import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 rounded-2xl border bg-white/50 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-3 h-24 w-full" />
          <Skeleton className="mt-2 h-24 w-full" />
        </div>
        <div className="lg:col-span-4 rounded-2xl border bg-white/50 p-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-3 h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
