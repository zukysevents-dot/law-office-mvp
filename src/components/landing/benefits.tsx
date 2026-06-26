import { CheckCircle2 } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const benefits = [
  {
    title: "Méně administrativy",
    body: "Data zadáte jednou. Subjekt, sazba i případ se propíší tam, kde je potřebujete — bez kopírování mezi tabulkami.",
  },
  {
    title: "Jasný přehled",
    body: "Dashboard ukáže aktivní úkoly, lhůty po termínu a vytížení kanceláře na první pohled.",
  },
  {
    title: "Lepší organizace",
    body: "Projekty, případy, dokumenty i výkazy drží pohromadě podle jedné srozumitelné struktury.",
  },
  {
    title: "Rychlejší přístup k informacím",
    body: "Vyhledávání podle názvu, IČO i role. Celá historie subjektu je na jednom místě.",
  },
];

export function Benefits() {
  return (
    <SectionShell id="prinosy" labelledBy="prinosy-heading">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            id="prinosy-heading"
            eyebrow="Přínosy"
            title="Méně režie, víc prostoru na samotnou práci."
            lead="Cílem není další nástroj navíc, ale jedno místo, které ušetří čas a sníží riziko chyb v každodenním provozu kanceláře."
          />
        </div>

        <ul className="flex flex-col gap-4">
          {benefits.map((benefit, index) => (
            <li key={benefit.title}>
              <Reveal delay={index * 70}>
                <div className="flex gap-4 rounded-xl border border-[var(--iv-line)] bg-white p-5 shadow-sm shadow-[var(--iv-deep)]/5 transition duration-300 hover:-translate-y-1 hover:shadow-md hover:shadow-[var(--iv-deep)]/10">
                  <CheckCircle2
                    className="mt-0.5 h-6 w-6 shrink-0 text-[var(--iv-teal)]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[var(--iv-ink)]">
                      {benefit.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--iv-muted)]">
                      {benefit.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
