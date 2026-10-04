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
      : "bg-[#17A2A2] text-[#0e1822]";
  const valueTone = tone === "danger" ? "text-red-900" : "text-[#0e1822]";

  const cardClass =
    "block rounded-lg border border-[#dce4e8] bg-white p-5 shadow-sm shadow-[#0e1822]/5";
  const interactiveClass = href
    ? " transition hover:border-[#0e1822]/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e1822]"
    : "";

  const inner = (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-[#0e1822]">{label}</p>
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
