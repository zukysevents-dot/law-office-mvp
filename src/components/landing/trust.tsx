import { ShieldCheck, ScrollText, Building2, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const roles = [
  { label: "Partner", tone: "dark" as const },
  { label: "Advokát", tone: "mint" as const },
  { label: "Koncipient", tone: "blue" as const },
  { label: "Praktikant", tone: "neutral" as const },
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
        <Reveal>
          <article className="flex h-full flex-col rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-sm shadow-[#072924]/5 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#B9DCC6] text-[#072924]">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-[#072924]">
              Přístup podle rolí
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f756e]">
              Každá role vidí jen to, co jí přísluší. Viditelnost se vynucuje už
              na úrovni databázových dotazů — ne až v rozhraní.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {roles.map((role) => (
                <Badge key={role.label} tone={role.tone}>
                  {role.label}
                </Badge>
              ))}
            </div>
          </article>
        </Reveal>

        <Reveal delay={100}>
          <article className="flex h-full flex-col rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-sm shadow-[#072924]/5 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#B9DCC6] text-[#072924]">
              <ScrollText className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-[#072924]">
              Neměnná auditní stopa
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f756e]">
              Každé založení, úprava i archivace se zaznamená — kdo, kdy a co
              změnil, včetně původní a nové hodnoty. Historie se nepřepisuje.
            </p>
          </article>
        </Reveal>

        <Reveal>
          <article className="flex h-full flex-col rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-sm shadow-[#072924]/5 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#B9DCC6] text-[#072924]">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-[#072924]">
              Ověřená data z rejstříků
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f756e]">
              Subjekty navázané na ARES. Strukturované a aktuální údaje místo
              ručního přepisování z webových stránek.
            </p>
          </article>
        </Reveal>

        <Reveal delay={100}>
          <article className="flex h-full flex-col rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-sm shadow-[#072924]/5 sm:p-8">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#B9DCC6] text-[#072924]">
              <Lock className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-[#072924]">
              Soukromí a GDPR
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#5f756e]">
              Interní systém kanceláře s oddělením přístupů a respektem
              k preferencím uživatelů u notifikací i sdílení.
            </p>
          </article>
        </Reveal>
      </div>
    </SectionShell>
  );
}
