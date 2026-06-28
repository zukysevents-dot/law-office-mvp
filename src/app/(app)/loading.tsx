// Suspense fallback for every (app) route. Next renders this while a route's
// async server component awaits its database round-trips: on client navigation
// it paints instantly (the AppShell layout persists, only this content area
// swaps), and on a fresh load it streams as the shell flushes before data is
// ready. Pages opt out by providing their own loading.tsx.
const cardClass =
  "min-w-0 rounded-lg border border-[#d4e2dc] bg-white p-5 shadow-sm shadow-[#072924]/5";

function Bar({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[#e3ede8] ${className ?? ""}`} />
  );
}

export default function AppLoading() {
  return (
    <>
      <div
        aria-hidden="true"
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="space-y-2">
          <Bar className="h-7 w-48" />
          <Bar className="h-4 w-80 max-w-full" />
        </div>
        <Bar className="h-9 w-36" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={cardClass}>
            <Bar className="h-4 w-24" />
            <Bar className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
        {[0, 1].map((card) => (
          <div key={card} className={cardClass}>
            <Bar className="h-5 w-40" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, row) => (
                <Bar key={row} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Načítání…
      </span>
    </>
  );
}
