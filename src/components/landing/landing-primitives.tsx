import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the IURIVERSE landing page so the sections share
 * rhythm, width and labelling without repeating boilerplate. Colours come from
 * the --iv-* tokens (globals.css) — scoped to the landing, the app is untouched.
 */

/** Consistent content width + horizontal padding (matches AppShell's container). */
export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

/** A landmarked section with consistent vertical rhythm and a labelled heading. */
export function SectionShell({
  id,
  labelledBy,
  children,
  className,
  tone = "base",
}: {
  id: string;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
  tone?: "base" | "surface";
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(
        "scroll-mt-24 py-20 sm:py-24 lg:py-28",
        tone === "surface" ? "bg-white" : "bg-[var(--iv-bg)]",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

/** Small uppercase eyebrow label used above section headings. */
export function Eyebrow({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]",
        tone === "dark"
          ? "text-[var(--iv-teal-ink)]"
          : "text-[var(--iv-teal-bright)]",
      )}
    >
      <span aria-hidden className="h-px w-6 bg-[var(--iv-teal)]" />
      {children}
    </span>
  );
}

/** Section heading + optional lead paragraph, consistently styled. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "left",
  className,
}: {
  id: string;
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        id={id}
        className="max-w-3xl text-balance text-3xl font-semibold tracking-tight text-[var(--iv-ink)] sm:text-4xl"
      >
        {title}
      </h2>
      {lead ? (
        <p className="max-w-2xl text-pretty text-base leading-relaxed text-[var(--iv-muted)] sm:text-lg">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/** Landing-only CTA (kept separate from the app's shared ui/Button so the
 *  IURIVERSE teal styling never bleeds into the authenticated app). */
const ctaVariants = {
  // Bright teal fill, dark ink text — pops on both the dark hero and light
  // sections; dark-on-bright-teal clears WCAG AA comfortably. The focus ring is
  // a two-layer indicator (dark outline + white gap) so it stays visible on the
  // bright-teal fill itself, on light sections AND on the dark hero — a single
  // teal-bright outline would be ~1:1 against the fill and ~2:1 on light bg,
  // failing WCAG 2.2 SC 1.4.11.
  solid:
    "bg-[var(--iv-teal-bright)] text-[var(--iv-deep)] shadow-lg shadow-[#17a2a2]/30 hover:bg-[#3ad2cd] focus-visible:outline-[var(--iv-deep)] focus-visible:[box-shadow:0_0_0_2px_#ffffff]",
  // Outline for use on dark backgrounds (hero, final CTA).
  outlineLight:
    "border border-white/25 bg-white/5 text-white hover:border-white/45 hover:bg-white/10 focus-visible:outline-white",
  // Outline for use on light backgrounds (header).
  outlineDark:
    "border border-[var(--iv-line)] bg-white text-[var(--iv-ink)] hover:border-[var(--iv-teal)] hover:text-[var(--iv-teal-ink)] focus-visible:outline-[var(--iv-teal-ink)]",
};

export type CtaVariant = keyof typeof ctaVariants;

export function CtaLink({
  href,
  variant = "solid",
  className,
  children,
}: {
  href: string;
  variant?: CtaVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        ctaVariants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
