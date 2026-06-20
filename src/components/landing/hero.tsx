import { ShieldCheck, ScrollText, Building2 } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/landing/landing-primitives";

const trustChips = [
  { icon: ShieldCheck, label: "Přístup podle rolí" },
  { icon: ScrollText, label: "Neměnná auditní stopa" },
  { icon: Building2, label: "Napojení na ARES" },
];

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-[#d4e2dc]/60"
    >
      {/* Brand-tinted backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[#eef5f1]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_-5%,rgba(185,220,198,0.55),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#B9DCC6] to-transparent"
      />

      <Container className="flex flex-col items-center py-20 text-center sm:py-28 lg:py-32">
        <div className="landing-rise-in">
          <Eyebrow>Interní právní systém</Eyebrow>
        </div>

        <h1
          id="hero-heading"
          className="landing-rise-in mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-[#072924] sm:text-5xl lg:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          Celá advokátní kancelář
          <br className="hidden sm:block" /> v jednom systému.
        </h1>

        <p
          className="landing-rise-in mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[#5f756e]"
          style={{ animationDelay: "160ms" }}
        >
          Evidence subjektů, kontrola střetu zájmů, lhůty, výkazy práce
          a fakturace — propojené v jednom bezpečném a auditovatelném prostředí.
          Žádné roztroušené tabulky, žádné přehlédnuté termíny.
        </p>

        <div
          className="landing-rise-in mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
          style={{ animationDelay: "240ms" }}
        >
          <ButtonLink href="/dashboard" variant="primary" className="px-6">
            Spustit systém
          </ButtonLink>
          <ButtonLink href="#produkt" variant="ghost" className="px-6">
            Prohlédnout produkt
          </ButtonLink>
        </div>

        <ul
          className="landing-rise-in mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          style={{ animationDelay: "320ms" }}
        >
          {trustChips.map((chip) => (
            <li
              key={chip.label}
              className="flex items-center gap-2 text-sm font-medium text-[#072924]/75"
            >
              <chip.icon className="h-4 w-4 text-[#072924]" aria-hidden />
              {chip.label}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
