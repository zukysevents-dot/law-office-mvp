import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-stone-200 bg-stone-50 text-stone-700",
  mint: "border-[#B9DCC6] bg-[#B9DCC6]/45 text-[#072924]",
  dark: "border-[#072924] bg-[#072924] text-white",
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  red: "border-red-200 bg-red-50 text-red-900",
  blue: "border-sky-200 bg-sky-50 text-sky-900",
  purple: "border-violet-200 bg-violet-50 text-violet-900",
};

export type BadgeTone = keyof typeof tones;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
