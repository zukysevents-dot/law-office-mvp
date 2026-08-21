import { cn } from "@/lib/utils";

/**
 * IURIVERSE brand lockup — the "pillar" mark (a stylised column: top slab,
 * three flutes, wider foundation) next to the IURIVERSE wordmark set in the
 * geometric display face (Michroma, via .font-display). Crisp at any size,
 * real selectable text for the name, and accessible (aria-label on the
 * wrapper, decorative parts hidden). The mark alone is reused as the favicon
 * (src/app/icon.svg).
 *
 * Landing-only: colours come from the --iv-* tokens, which the app never
 * reads. The mark inherits currentColor so callers pick the tone.
 */

/** The standalone pillar mark. Color via currentColor. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="currentColor">
      <rect x="12" y="8.5" width="24" height="4.5" rx="1.2" />
      <rect x="14.5" y="16" width="5.5" height="16.5" rx="2.75" />
      <rect x="21.25" y="16" width="5.5" height="16.5" rx="2.75" />
      <rect x="28" y="16" width="5.5" height="16.5" rx="2.75" />
      <rect x="10" y="35.5" width="28" height="4.5" rx="1.2" />
    </svg>
  );
}

/** Full lockup: pillar mark + IURIVERSE wordmark. */
export function IuriverseLogo({
  className,
  tone = "dark",
  markClassName,
}: {
  className?: string;
  tone?: "dark" | "light";
  markClassName?: string;
}) {
  return (
    <span
      role="img"
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="IURIVERSE"
    >
      <BrandMark
        className={cn(
          "h-7 w-7 shrink-0",
          tone === "dark"
            ? "text-[var(--iv-teal)]"
            : "text-[var(--iv-teal-bright)]",
          markClassName,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "font-display text-base leading-none tracking-[0.16em] sm:text-lg",
          tone === "dark" ? "text-[var(--iv-slate)]" : "text-white",
        )}
      >
        IURIVERSE
      </span>
    </span>
  );
}
