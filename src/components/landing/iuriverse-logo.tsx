import { cn } from "@/lib/utils";

/**
 * IURIVERSE brand lockup — the "orbit" mark (a circular core with two crossed
 * elliptical orbits and a small satellite riding the outer one; reads as both
 * a planetary system and an atom) next to the IURIVERSE wordmark set in the
 * geometric display face (Michroma, via .font-display). Crisp at any size,
 * real selectable text for the name, and accessible (aria-label on the
 * wrapper, decorative parts hidden). The mark alone is reused as the favicon
 * (src/app/icon.svg).
 *
 * Landing-only: colours come from the --iv-* tokens, which the app never
 * reads. The mark inherits currentColor so callers pick the tone.
 */

/** The standalone orbit mark. Color via currentColor. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none">
      <ellipse
        cx="24"
        cy="24"
        rx="19"
        ry="7.5"
        transform="rotate(-28 24 24)"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="19"
        ry="7.5"
        transform="rotate(28 24 24)"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      {/* Core (nucleus / planet). */}
      <circle cx="24" cy="24" r="6" fill="currentColor" />
      {/* Satellite riding the upper-right of the first orbit. */}
      <circle cx="38.3" cy="22.4" r="2.4" fill="currentColor" />
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
