import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "mint",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "mint" | "danger";
}) {
  const iconTone =
    tone === "danger"
      ? "bg-red-50 text-red-900 border border-red-100"
      : "bg-[#B9DCC6] text-[#072924]";
  const valueTone = tone === "danger" ? "text-red-900" : "text-[#072924]";

  return (
    <div className="rounded-lg border border-[#d4e2dc] bg-white p-5 shadow-sm shadow-[#072924]/5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-[#072924]">{label}</p>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-md ${iconTone}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-4 text-3xl font-semibold ${valueTone}`}>{value}</p>
    </div>
  );
}
