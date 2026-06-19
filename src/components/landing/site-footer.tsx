import Link from "next/link";

import { Container, Wordmark } from "@/components/landing/landing-primitives";

const productLinks = [
  { href: "#produkt", label: "Produkt" },
  { href: "#funkce", label: "Funkce" },
  { href: "#postup", label: "Postup" },
  { href: "#duvera", label: "Důvěra" },
];

const systemLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/subjects", label: "Subjekty" },
  { href: "/conflict-check", label: "Conflict check" },
  { href: "/calendar", label: "Kalendář" },
];

export function SiteFooter() {
  return (
    <footer
      aria-label="Patička"
      className="border-t border-[#1c4038] bg-[#072924] text-[#d8eee0]"
    >
      <Container className="py-14">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-xs">
            <Wordmark tone="light" className="text-xl" />
            <p className="mt-4 text-sm leading-relaxed text-[#d8eee0]/80">
              Interní právní systém pro správu subjektů, případů, lhůt a výkazů
              práce advokátní kanceláře.
            </p>
          </div>

          <nav aria-label="Stránka">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B9DCC6]">
              Stránka
            </h2>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-[#d8eee0]/85 transition hover:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Systém">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B9DCC6]">
              Systém
            </h2>
            <ul className="mt-4 space-y-2.5">
              {systemLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#d8eee0]/85 transition hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-[#1c4038] pt-6 text-xs text-[#d8eee0]/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} syndikat.legal — Interní právní systém.</p>
          <p>Přístup podle rolí · Auditní stopa · Data v souladu s GDPR</p>
        </div>
      </Container>
    </footer>
  );
}
