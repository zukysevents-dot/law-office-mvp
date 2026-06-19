import { CheckCircle2 } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import {
  SectionShell,
  Eyebrow,
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
          <Eyebrow>Přínosy</Eyebrow>
          <h2
            id="prinosy-heading"
            className="mt-4 text-balance text-3xl font-semibold tracking-tight text-[#072924] sm:text-4xl"
          >
            Méně režie, víc prostoru na samotnou práci.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-[#5f756e] sm:text-lg">
            Cílem není další nástroj navíc, ale jedno místo, které ušetří čas
            a sníží riziko chyb v každodenním provozu kanceláře.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {benefits.map((benefit, index) => (
            <li key={benefit.title}>
              <Reveal delay={index * 70}>
                <div className="flex gap-4 rounded-xl border border-[#d4e2dc] bg-white p-5 shadow-sm shadow-[#072924]/5 transition duration-300 hover:-translate-y-1 hover:shadow-md hover:shadow-[#072924]/10">
                  <CheckCircle2
                    className="mt-0.5 h-6 w-6 shrink-0 text-[#072924]"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[#072924]">
                      {benefit.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#5f756e]">
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
