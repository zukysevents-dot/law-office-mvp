import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const linkClass =
  "inline-flex h-9 items-center gap-1 rounded-md border border-[#dce4e8] bg-white px-3 text-sm font-medium text-[#0e1822] transition hover:border-[#0e1822]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]";

// Předchozí / další období (navigace — progress bar z balíku 01 je automatický).
export function PeriodNav({
  label,
  prevHref,
  nextHref,
}: {
  label: string;
  prevHref: string;
  nextHref: string;
}) {
  return (
    <nav
      aria-label="Období"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <Link href={prevHref} className={linkClass} rel="prev">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Předchozí
      </Link>
      <p
        className="order-first w-full text-center text-sm font-semibold text-[#0e1822] sm:order-none sm:w-auto"
        data-performance-period
      >
        {label}
      </p>
      <Link href={nextHref} className={linkClass} rel="next">
        Další
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </nav>
  );
}
