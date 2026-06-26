import { Container, Eyebrow, CtaLink } from "@/components/landing/landing-primitives";

export function FinalCta() {
  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="relative scroll-mt-24 overflow-hidden bg-[var(--iv-deep)] py-20 sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_80%_at_50%_0%,rgba(45,198,194,0.16),transparent_70%)]"
      />
      <Container>
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Eyebrow tone="light">Začněte hned</Eyebrow>
          <h2
            id="demo-heading"
            className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl"
          >
            Mějte celou kancelář pod kontrolou.
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--iv-on-dark)] sm:text-lg">
            Otevřete systém a projděte si dashboard, evidenci subjektů
            a přehled lhůt — připravené na každodenní provoz kanceláře.
          </p>
          <div className="mt-8">
            <CtaLink href="/login" variant="solid" className="px-6">
              Spustit systém
            </CtaLink>
          </div>
        </div>
      </Container>
    </section>
  );
}
