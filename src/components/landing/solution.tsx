import { X, Check } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const before = [
  "Klienti a protistrany v oddělených tabulkách",
  "Kontrola střetu zájmů z paměti a e‑mailů",
  "Lhůty roztroušené v kalendářích a poznámkách",
  "Hodiny dopisované dodatečně, mimo fakturaci",
  "Změny bez záznamu, kdo a kdy je provedl",
];

const after = [
  "Jednotná evidence subjektů s rolemi v projektech a případech",
  "Conflict check nad historickými vazbami a riziky",
  "Kalendář procesních i interních lhůt napříč kanceláří",
  "Výkazy práce navázané přímo na fakturaci v CZK",
  "Neměnná auditní stopa každé změny",
];

export function Solution() {
  return (
    <SectionShell id="reseni" labelledBy="reseni-heading">
      <SectionHeading
        id="reseni-heading"
        eyebrow="Řešení"
        title="Jeden systém, kde na sebe data navazují."
        lead="Subjekt, který založíte, projde celým životním cyklem práce — od prověření konfliktu přes případ a výkaz až po fakturu. Nic se neztratí mezi nástroji."
      />

      <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-2xl border border-[#d4e2dc] bg-white p-6 shadow-sm shadow-[#072924]/5 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5f756e]">
              Dříve
            </p>
            <ul className="mt-5 space-y-3.5">
              {before.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#d4e2dc] bg-[#eef5f1] text-[#5f756e]">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="text-sm leading-relaxed text-[#5f756e]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="h-full rounded-2xl border border-[#072924] bg-[#072924] p-6 shadow-lg shadow-[#072924]/15 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B9DCC6]">
              Se syndikat.legal
            </p>
            <ul className="mt-5 space-y-3.5">
              {after.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#B9DCC6] text-[#072924]">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="text-sm leading-relaxed text-[#d8eee0]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
