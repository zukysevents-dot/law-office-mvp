import {
  FileSpreadsheet,
  ShieldAlert,
  Hourglass,
  Clock3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const pains: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileSpreadsheet,
    title: "Roztříštěná evidence subjektů",
    body: "Klienti, protistrany a kontakty žijí v oddělených tabulkách. Stejný subjekt existuje v několika verzích a nikdo neví, která platí.",
  },
  {
    icon: ShieldAlert,
    title: "Skrytý střet zájmů",
    body: "Kontrola konfliktů závisí na paměti a hledání v e‑mailech. Historická role protistrany se snadno přehlédne.",
  },
  {
    icon: Hourglass,
    title: "Zmeškané lhůty",
    body: "Procesní i interní lhůty jsou roztroušené v hlavách, kalendářích a poznámkách. Stačí jeden přehlédnutý termín.",
  },
  {
    icon: Clock3,
    title: "Unikající fakturace",
    body: "Odpracované hodiny se dopisují později nebo vůbec. Vykázaný čas neodpovídá skutečné práci a kancelář přichází o peníze.",
  },
];

export function Problem() {
  return (
    <SectionShell id="problem" labelledBy="problem-heading" tone="surface">
      <SectionHeading
        id="problem-heading"
        eyebrow="Proč to vzniklo"
        title="Administrativa kanceláře se rozpadá do nástrojů, které spolu nemluví."
        lead="Excel, e‑mail, sdílený disk a papír. Informace nikdy nejsou na jednom místě — a každá mezera je riziko."
      />

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {pains.map((pain, index) => (
          <Reveal key={pain.title} delay={index * 70}>
            <article className="flex h-full gap-4 rounded-xl border border-[#d4e2dc] bg-white p-5 shadow-sm shadow-[#072924]/5 transition duration-300 hover:-translate-y-1 hover:shadow-md hover:shadow-[#072924]/10">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-100 bg-amber-50 text-amber-900">
                <pain.icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-[#072924]">
                  {pain.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#5f756e]">
                  {pain.body}
                </p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}
