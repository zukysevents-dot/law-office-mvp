import {
  Building2,
  ShieldCheck,
  ListTodo,
  Clock3,
  Receipt,
  CalendarDays,
  ScrollText,
  WandSparkles,
  FolderOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const features: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Building2,
    title: "Subjekty",
    body: "Jednotná evidence osob a organizací bez duplicitní klientské tabulky. Jeden subjekt, role napříč projekty a případy.",
  },
  {
    icon: ShieldCheck,
    title: "Conflict check",
    body: "Prověření existujících subjektů, jejich rolí a historických vazeb dřív, než kancelář převezme věc.",
  },
  {
    icon: ListTodo,
    title: "Úkoly a lhůty",
    body: "Procesní i interní lhůty, priority, odpovědné osoby a stavy — s přehledem o termínech po splatnosti.",
  },
  {
    icon: Clock3,
    title: "Výkazy práce",
    body: "Záznam odpracovaných hodin s automatickým výpočtem částky v CZK podle sazby případu, projektu nebo subjektu.",
  },
  {
    icon: Receipt,
    title: "Fakturace",
    body: "Podklady pro fakturaci po subjektech, projektech i případech — se schvalovacím workflow a exportem.",
  },
  {
    icon: CalendarDays,
    title: "Kalendář",
    body: "Termíny úkolů — procesní a interní lhůty napříč projekty a případy na jednom místě.",
  },
  {
    icon: WandSparkles,
    title: "Napojení na ARES",
    body: "Automatické doplnění subjektu podle IČO z veřejných rejstříků, včetně právní formy a rizikových příznaků.",
  },
  {
    icon: FolderOpen,
    title: "SharePoint",
    body: "Konzistentní struktura složek pro každý subjekt, projekt a případ — dokumenty vždy tam, kde mají být.",
  },
  {
    icon: ScrollText,
    title: "Audit log",
    body: "Neměnný záznam každé změny — kdo, kdy a co upravil. Pro vnitřní kontrolu i compliance.",
  },
];

export function FeaturesGrid() {
  return (
    <SectionShell id="funkce" labelledBy="funkce-heading" tone="surface">
      <SectionHeading
        id="funkce-heading"
        eyebrow="Funkce"
        title="Postavené na skutečné práci advokátní kanceláře."
        lead="Každý modul pokrývá konkrétní část agendy — a všechny sdílejí stejná data, role a auditní stopu."
      />

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 70}>
            <article className="group flex h-full flex-col rounded-xl border border-[#d4e2dc] bg-white p-6 shadow-sm shadow-[#072924]/5 transition duration-300 hover:-translate-y-1 hover:border-[#B9DCC6] hover:shadow-md hover:shadow-[#072924]/10">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#B9DCC6] text-[#072924] transition group-hover:bg-[#072924] group-hover:text-[#B9DCC6]">
                <feature.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-[#072924]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5f756e]">
                {feature.body}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}
