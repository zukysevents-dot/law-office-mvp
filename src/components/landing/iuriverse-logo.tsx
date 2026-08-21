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

/** The standalone orbit mark: the original single-ring composition (square
 *  planet + tilted orbit), with a subtle brand-teal gradient on the planet.
 *  Ring inherits currentColor so callers pick the tone. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden fill="none">
      <defs>
        {/* Duplicate ids across instances are harmless: the defs are identical. */}
        <linearGradient id="iv-mark-planet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--iv-teal-bright)" />
          <stop offset="1" stopColor="var(--iv-teal)" />
        </linearGradient>
      </defs>
      <ellipse
        cx="22"
        cy="22"
        rx="19.5"
        ry="6.6"
        transform="rotate(-24 22 22)"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <rect
        x="15.5"
        y="13"
        width="13"
        height="13"
        rx="3.2"
        fill="url(#iv-mark-planet)"
      />
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
