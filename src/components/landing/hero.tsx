import { ShieldCheck, ScrollText, Building2 } from "lucide-react";

import { Container, Eyebrow, CtaLink } from "@/components/landing/landing-primitives";

const trustChips = [
  { icon: ShieldCheck, label: "Přístup podle rolí" },
  { icon: ScrollText, label: "Neměnná auditní stopa" },
  { icon: Building2, label: "Napojení na ARES" },
];

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden bg-[var(--iv-deep)]"
    >
      {/* Deep vertical wash + breathing teal glow at the top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(120%_80%_at_50%_-10%,var(--iv-deep-2),var(--iv-deep)_60%)]"
      />
      <div
        aria-hidden
        className="iv-glow-pulse pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[420px] w-[820px] max-w-none bg-[radial-gradient(50%_50%_at_50%_0%,rgba(45,198,194,0.20),transparent_70%)]"
      />

      {/* Slowly rotating orbital rings echoing the logo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[14%] -z-10 -translate-x-1/2"
      >
        <svg
          width="1040"
          height="560"
          viewBox="0 0 1040 560"
          className="iv-orbit-spin max-w-none"
          fill="none"
        >
          <g transform="rotate(-14 520 280)">
            <ellipse cx="520" cy="280" rx="500" ry="172" stroke="rgba(45,198,194,0.16)" strokeWidth="1.5" />
            <ellipse cx="520" cy="280" rx="370" ry="126" stroke="rgba(45,198,194,0.20)" strokeWidth="1.5" />
            <ellipse cx="520" cy="280" rx="240" ry="80" stroke="rgba(45,198,194,0.26)" strokeWidth="1.5" />
            {/* a small "planet" riding the middle ring */}
            <rect x="884" y="266" width="16" height="16" rx="4" fill="rgba(45,198,194,0.55)" />
          </g>
        </svg>
      </div>
      {/* Hairline accent at the very top edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--iv-teal)]/50 to-transparent"
      />

      <Container className="flex flex-col items-center pb-24 pt-28 text-center sm:pb-32 sm:pt-36">
        <div className="landing-rise-in">
          <Eyebrow tone="light">Software pro advokátní kancelář</Eyebrow>
        </div>

        <h1
          id="hero-heading"
          className="landing-rise-in mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          Celá advokátní kancelář
          <br className="hidden sm:block" />{" "}
          <span className="text-[var(--iv-teal-bright)]">na jedné oběžné dráze.</span>
        </h1>

        <p
          className="landing-rise-in mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[var(--iv-on-dark)]"
          style={{ animationDelay: "160ms" }}
        >
          Evidence subjektů, kontrola střetu zájmů, lhůty, výkazy práce
          a fakturace — propojené v jednom bezpečném a auditovatelném systému.
          Žádné roztroušené tabulky, žádné přehlédnuté termíny.
        </p>

        <div
          className="landing-rise-in mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          style={{ animationDelay: "240ms" }}
        >
          <CtaLink href="/login" variant="solid" className="px-6">
            Spustit systém
          </CtaLink>
          <CtaLink href="#produkt" variant="outlineLight" className="px-6">
            Prohlédnout produkt
          </CtaLink>
        </div>

        <ul
          className="landing-rise-in mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          style={{ animationDelay: "320ms" }}
        >
          {trustChips.map((chip) => (
            <li
              key={chip.label}
              className="flex items-center gap-2 text-sm font-medium text-white/70"
            >
              <chip.icon className="h-4 w-4 text-[var(--iv-teal-bright)]" aria-hidden />
              {chip.label}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
