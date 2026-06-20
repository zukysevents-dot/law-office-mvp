import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the landing page so the sections share rhythm,
 * width and labelling without repeating boilerplate. Brand hex values mirror
 * the app's own components (src/components/*) intentionally.
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
        tone === "surface" && "bg-white",
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
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "dark" ? "text-[#072924]" : "text-[#B9DCC6]",
      )}
    >
      <span
        aria-hidden
        className={cn("h-px w-6", tone === "dark" ? "bg-[#B9DCC6]" : "bg-[#B9DCC6]/60")}
      />
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
        className="max-w-3xl text-balance text-3xl font-semibold tracking-tight text-[#072924] sm:text-4xl"
      >
        {title}
      </h2>
      {lead ? (
        <p className="max-w-2xl text-pretty text-base leading-relaxed text-[#5f756e] sm:text-lg">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/** The text wordmark used in the header and footer (crisp, scalable, on-brand). */
export function Wordmark({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const base = tone === "dark" ? "text-[#072924]" : "text-white";
  // Mint dot reads as an accent on dark; on the light header it would vanish,
  // so there it takes a darker mint that stays visible.
  const dot = tone === "dark" ? "text-[#3f8f6e]" : "text-[#B9DCC6]";
  return (
    <span
      className={cn(
        "text-lg font-semibold tracking-tight lowercase",
        base,
        className,
      )}
    >
      syndikat<span className={dot}>.</span>legal
    </span>
  );
}
