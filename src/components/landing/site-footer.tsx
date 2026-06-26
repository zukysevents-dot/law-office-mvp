import Link from "next/link";

import { Container } from "@/components/landing/landing-primitives";
import { IuriverseLogo } from "@/components/landing/iuriverse-logo";

const productLinks = [
  { href: "#produkt", label: "Produkt" },
  { href: "#funkce", label: "Funkce" },
  { href: "#postup", label: "Postup" },
  { href: "#duvera", label: "Důvěra" },
];

const systemLinks = [
  { href: "/login", label: "Přihlášení" },
  { href: "/subjects", label: "Subjekty" },
  { href: "/conflict-check", label: "Conflict check" },
  { href: "/calendar", label: "Kalendář" },
];

export function SiteFooter() {
  return (
    <footer
      aria-label="Patička"
      className="border-t border-white/10 bg-[var(--iv-deep)] text-[var(--iv-on-dark)]"
    >
      <Container className="py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-xs">
            <IuriverseLogo tone="light" />
            <p className="mt-4 text-sm leading-relaxed text-[var(--iv-on-dark)]/80">
              Softwarový systém pro správu subjektů, případů, lhůt a výkazů práce
              advokátní kanceláře.
            </p>
          </div>

          <nav aria-label="Stránka">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--iv-teal-bright)]">
              Stránka
            </h2>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-sm text-sm text-[var(--iv-on-dark)]/85 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--iv-teal-bright)]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Systém">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--iv-teal-bright)]">
              Systém
            </h2>
            <ul className="mt-4 space-y-2.5">
              {systemLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-sm text-sm text-[var(--iv-on-dark)]/85 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--iv-teal-bright)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-[var(--iv-on-dark)]/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} IURIVERSE s.r.o. — software pro advokátní kanceláře.</p>
          <p>Přístup podle rolí · Auditní stopa · Data v souladu s GDPR</p>
        </div>
      </Container>
    </footer>
  );
}
