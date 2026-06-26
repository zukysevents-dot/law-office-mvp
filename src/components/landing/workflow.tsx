import {
  Building2,
  ShieldCheck,
  BriefcaseBusiness,
  Clock3,
  Receipt,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const steps: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Building2,
    title: "Založení subjektu",
    body: "Subjekt vznikne načtením z ARES podle IČO — s adresou, právní formou i rizikovými příznaky.",
  },
  {
    icon: ShieldCheck,
    title: "Kontrola konfliktu",
    body: "Conflict check prověří historické role a vazby subjektu napříč celou kanceláří.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Projekt a případ",
    body: "Otevřete projekt a vnořený případ s odpovědným advokátem, sazbou a složkami.",
  },
  {
    icon: Clock3,
    title: "Výkaz práce",
    body: "Průběžně zaznamenáváte odpracované hodiny; částka v CZK se počítá automaticky.",
  },
  {
    icon: Receipt,
    title: "Fakturace",
    body: "Schválené výkazy se promítnou do podkladů pro fakturaci po subjektu, projektu i případu.",
  },
];

export function Workflow() {
  return (
    <SectionShell id="postup" labelledBy="postup-heading">
      <SectionHeading
        id="postup-heading"
        eyebrow="Jak to funguje"
        title="Od prvního kontaktu po fakturu — jedna souvislá linka."
        lead="Data nepřepisujete mezi nástroji. Každý krok navazuje na předchozí a zůstává dohledatelný."
      />

      <ol className="relative mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
        <span
          aria-hidden
          className="absolute left-6 top-6 hidden h-px bg-gradient-to-r from-[var(--iv-teal)] via-[var(--iv-teal)]/60 to-transparent lg:block"
          style={{ width: "calc(100% - 3rem)" }}
        />
        {steps.map((step, index) => (
          <li key={step.title} className="relative">
            <Reveal delay={index * 80}>
              <div className="flex items-center gap-3 lg:flex-col lg:items-start">
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--iv-deep)] text-base font-semibold text-white ring-4 ring-[var(--iv-bg)]">
                  {index + 1}
                </span>
                <step.icon
                  className="h-5 w-5 text-[var(--iv-teal-ink)] lg:mt-4"
                  aria-hidden
                />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[var(--iv-ink)]">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--iv-muted)]">
                {step.body}
              </p>
            </Reveal>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
