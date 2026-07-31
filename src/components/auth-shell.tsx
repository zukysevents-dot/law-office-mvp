import Link from "next/link";

import { IuriverseLogo } from "@/components/landing/iuriverse-logo";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  className,
  mainId,
  tabIndex,
}: {
  children: React.ReactNode;
  className?: string;
  mainId?: string;
  tabIndex?: number;
}) {
  return (
    <main
      id={mainId}
      tabIndex={tabIndex}
      className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[var(--iv-deep)] px-4 py-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 mx-auto h-[34rem] max-w-5xl bg-[radial-gradient(50%_55%_at_50%_0%,rgba(45,198,194,0.22),transparent_72%)]"
      />
      <svg
        aria-hidden
        viewBox="0 0 1000 420"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 w-[72rem] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-50"
        fill="none"
      >
        <g transform="rotate(-12 500 210)">
          <ellipse
            cx="500"
            cy="210"
            rx="475"
            ry="145"
            stroke="rgba(45,198,194,0.18)"
          />
          <ellipse
            cx="500"
            cy="210"
            rx="350"
            ry="105"
            stroke="rgba(45,198,194,0.22)"
          />
        </g>
      </svg>

      <section
        className={cn(
          "relative z-10 w-full max-w-sm rounded-2xl border border-white/50 bg-white p-8 shadow-2xl shadow-black/35",
          className,
        )}
      >
        <div className="mb-7 flex justify-center">
          <Link
            href="/"
            aria-label="IURIVERSE — domů"
            className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--iv-teal-ink)]"
          >
            <IuriverseLogo
              tone="dark"
              className="gap-3"
              markClassName="h-9 w-9"
            />
          </Link>
        </div>
        {children}
      </section>
    </main>
  );
}
