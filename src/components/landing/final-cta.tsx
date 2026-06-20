import { ButtonLink } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/landing/landing-primitives";

export function FinalCta() {
  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="scroll-mt-24 bg-[#072924] py-20 sm:py-24"
    >
      <Container>
        <div className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_70%_at_50%_0%,rgba(185,220,198,0.18),transparent_70%)]"
          />
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <Eyebrow tone="light">Začněte hned</Eyebrow>
            <h2
              id="demo-heading"
              className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            >
              Mějte celou kancelář pod kontrolou.
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-[#d8eee0] sm:text-lg">
              Otevřete systém a projděte si dashboard, evidenci subjektů
              a přehled lhůt — připravené na každodenní provoz kanceláře.
            </p>
            <div className="mt-8">
              <ButtonLink href="/dashboard" variant="secondary" className="px-6">
                Spustit systém
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
