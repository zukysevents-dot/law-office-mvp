import { ShieldCheck, ScrollText, Building2, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const roles = ["Partner", "Advokát", "Koncipient", "Praktikant"];

const pillars: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: "Přístup podle rolí",
    body: "Každá role vidí jen to, co jí přísluší. Viditelnost se vynucuje už na úrovni databázových dotazů — ne až v rozhraní.",
  },
  {
    icon: ScrollText,
    title: "Neměnná auditní stopa",
    body: "Každé založení, úprava i archivace se zaznamená — kdo, kdy a co změnil, včetně původní a nové hodnoty. Historie se nepřepisuje.",
  },
  {
    icon: Building2,
    title: "Ověřená data z rejstříků",
    body: "Subjekty navázané na ARES. Strukturované a aktuální údaje místo ručního přepisování z webových stránek.",
  },
  {
    icon: Lock,
    title: "Soukromí a GDPR",
    body: "Interní systém kanceláře s oddělením přístupů a respektem k preferencím uživatelů u notifikací i sdílení.",
  },
];

export function Trust() {
  return (
    <SectionShell id="duvera" labelledBy="duvera-heading" tone="surface">
      <SectionHeading
        id="duvera-heading"
        eyebrow="Důvěra a kontrola"
        title="Postaveno pro citlivá data advokátní kanceláře."
        lead="Bezpečnost a dohledatelnost nejsou doplněk — jsou součástí každého modulu."
      />

      <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pillars.map((pillar, index) => (
          <Reveal key={pillar.title} delay={(index % 2) * 100}>
            <article className="flex h-full flex-col rounded-2xl border border-[var(--iv-line)] bg-white p-6 shadow-sm shadow-[var(--iv-deep)]/5 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--iv-teal)]/12 text-[var(--iv-teal-ink)]">
                <pillar.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[var(--iv-ink)]">
                {pillar.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--iv-muted)]">
                {pillar.body}
              </p>
              {pillar.title === "Přístup podle rolí" ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex items-center rounded-full border border-[var(--iv-line)] bg-[var(--iv-teal)]/10 px-3 py-1 text-xs font-medium text-[var(--iv-teal-ink)]"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}
