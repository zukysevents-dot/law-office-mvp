import { cn } from "@/lib/utils";

/**
 * IURIVERSE brand lockup — an SVG "orbit" symbol (a teal planet-square circled
 * by a tilted ring) next to the IURIVERSE wordmark set in the geometric display
 * face (Michroma, via .font-display). Crisp at any size, real selectable text
 * for the name, and accessible (aria-label on the wrapper, decorative parts
 * hidden). The symbol alone is reused as the favicon (src/app/icon.svg).
 *
 * Landing-only: colours come from the --iv-* tokens, which the app never reads.
 */

/** The standalone orbit symbol (planet-square + tilted ring). */
export function OrbitMark({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 44 44"
      className={className}
      aria-hidden
      fill="none"
    >
      {/* Tilted orbit ring (sits behind the planet where they overlap). */}
      <g
        className={cn(animated && "iv-orbit-spin")}
        style={{ transformOrigin: "22px 22px" }}
      >
        <ellipse
          cx="22"
          cy="22"
          rx="19.5"
          ry="6.6"
          transform="rotate(-24 22 22)"
          stroke="var(--iv-teal)"
          strokeWidth="2.4"
        />
      </g>
      {/* The "planet" — the square dot from the logo. */}
      <rect
        x="15.5"
        y="13"
        width="13"
        height="13"
        rx="3.2"
        fill="var(--iv-teal)"
      />
    </svg>
  );
}

/** Full lockup: orbit symbol + IURIVERSE wordmark. */
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
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label="IURIVERSE"
    >
      <OrbitMark className={cn("h-7 w-7 shrink-0", markClassName)} />
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
