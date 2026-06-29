import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "mint",
  href,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "mint" | "danger";
  // When set, the whole card becomes a link (lawyers asked for the dashboard
  // boxes to be clickable, e.g. "Úkoly po termínu" → filtered task list).
  href?: string;
}) {
  const iconTone =
    tone === "danger"
      ? "bg-red-50 text-red-900 border border-red-100"
      : "bg-[#B9DCC6] text-[#072924]";
  const valueTone = tone === "danger" ? "text-red-900" : "text-[#072924]";

  const cardClass =
    "block rounded-lg border border-[#d4e2dc] bg-white p-5 shadow-sm shadow-[#072924]/5";
  const interactiveClass = href
    ? " transition hover:border-[#072924]/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#072924]"
    : "";

  const inner = (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-[#072924]">{label}</p>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-md ${iconTone}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-4 text-3xl font-semibold ${valueTone}`}>{value}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClass + interactiveClass}>
        {inner}
      </Link>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}
