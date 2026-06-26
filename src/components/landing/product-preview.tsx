import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  ListTodo,
  Clock3,
  Receipt,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/landing/reveal";
import { OrbitMark } from "@/components/landing/iuriverse-logo";
import {
  Container,
  SectionHeading,
} from "@/components/landing/landing-primitives";

const previewNav = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Subjekty", icon: Building2, active: false },
  { label: "Conflict check", icon: ShieldCheck, active: false },
  { label: "Úkoly", icon: ListTodo, active: false },
  { label: "Výkazy práce", icon: Clock3, active: false },
  { label: "Fakturace", icon: Receipt, active: false },
  { label: "Kalendář", icon: CalendarDays, active: false },
];

const previewStats: {
  label: string;
  value: string;
  icon: LucideIcon;
  danger?: boolean;
}[] = [
  { label: "Aktivní úkoly", value: "128", icon: ListTodo },
  { label: "Po termínu", value: "3", icon: AlertTriangle, danger: true },
  { label: "Hodiny tento měsíc", value: "146,5", icon: Clock3 },
];

const previewTasks: {
  task: string;
  matter: string;
  deadline: string;
  status: string;
  tone: BadgeTone;
}[] = [
  {
    task: "Odvolání proti rozhodnutí",
    matter: "Novák ./. ČSOB",
    deadline: "12. 6.",
    status: "Po termínu",
    tone: "red",
  },
  {
    task: "Kontrola smlouvy o dílo",
    matter: "Stavby Morava s.r.o.",
    deadline: "18. 6.",
    status: "Ke kontrole",
    tone: "amber",
  },
  {
    task: "Podání žaloby k soudu",
    matter: "Dědické řízení Kremličková",
    deadline: "20. 6.",
    status: "Podáno",
    tone: "green",
  },
  {
    task: "Příprava plné moci",
    matter: "AgroCZ a.s.",
    deadline: "24. 6.",
    status: "Koncept",
    tone: "neutral",
  },
];

export function ProductPreview() {
  return (
    <section
      id="produkt"
      aria-labelledby="produkt-heading"
      className="scroll-mt-24 bg-[var(--iv-bg)] py-20 sm:py-24 lg:py-28"
    >
      <Container>
        <SectionHeading
          id="produkt-heading"
          eyebrow="Jedno pracovní prostředí"
          title="Přehled celé kanceláře na jedné obrazovce."
          lead="Aktivní práce, lhůty po termínu a vytížení — bez přepínání mezi tabulkami, e‑maily a sdílenými disky."
        />

        <Reveal className="mt-12">
          {/* Browser-chrome frame */}
          <div className="overflow-hidden rounded-2xl border border-[var(--iv-line)] bg-white shadow-2xl shadow-[var(--iv-deep)]/15">
            <div className="flex items-center gap-3 border-b border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 py-3">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[var(--iv-line)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--iv-line)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--iv-line)]" />
              </div>
              <div className="mx-auto flex max-w-xs flex-1 items-center justify-center rounded-md border border-[var(--iv-line)] bg-white px-3 py-1 text-xs text-[var(--iv-muted)]">
                app.iuriverse.cz/dashboard
              </div>
            </div>

            <div className="flex">
              {/* Mini sidebar (hidden on small screens) */}
              <aside className="hidden w-56 shrink-0 flex-col bg-[var(--iv-deep)] p-3 md:flex">
                <div className="flex h-12 items-center gap-2 px-2">
                  <OrbitMark className="h-6 w-6" />
                  <span className="font-display text-sm tracking-[0.16em] text-white">
                    IURIVERSE
                  </span>
                </div>
                <nav className="mt-3 flex flex-col gap-1" aria-hidden>
                  {previewNav.map((item) => (
                    <span
                      key={item.label}
                      className={
                        item.active
                          ? "flex items-center gap-3 rounded-md bg-[var(--iv-teal)] px-3 py-2 text-sm font-medium text-[var(--iv-deep)]"
                          : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/65"
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                  ))}
                </nav>
              </aside>

              {/* Main panel */}
              <div className="min-w-0 flex-1 bg-[var(--iv-bg)]/50 p-5 sm:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-[var(--iv-ink)]">
                      Dashboard
                    </h3>
                    <p className="mt-1 text-sm text-[var(--iv-muted)]">
                      Rychlý přehled aktivní práce, konfliktů a vytížení
                      kanceláře.
                    </p>
                  </div>
                  <span className="hidden shrink-0 items-center gap-2 rounded-md bg-[var(--iv-teal)] px-3 py-2 text-sm font-medium text-[var(--iv-deep)] sm:inline-flex">
                    Nastavit dashboard
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {previewStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-[var(--iv-line)] bg-white p-4 shadow-sm shadow-[var(--iv-deep)]/5"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-[var(--iv-muted)]">
                          {stat.label}
                        </p>
                        <stat.icon
                          className={cn(
                            "h-4 w-4",
                            stat.danger
                              ? "text-red-600"
                              : "text-[var(--iv-teal)]",
                          )}
                          aria-hidden
                        />
                      </div>
                      <p className="mt-2 text-2xl font-semibold text-[var(--iv-ink)]">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-lg border border-[var(--iv-line)] bg-white p-4 shadow-sm shadow-[var(--iv-deep)]/5 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[var(--iv-ink)]">
                      Nadcházející lhůty
                    </h4>
                    <span className="text-xs font-medium text-[var(--iv-muted)]">
                      Procesní i interní
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Úkol</th>
                          <th>Případ</th>
                          <th>Lhůta</th>
                          <th>Stav</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTasks.map((row) => (
                          <tr key={row.task}>
                            <td className="font-medium text-[var(--iv-ink)]">
                              {row.task}
                            </td>
                            <td className="text-[var(--iv-muted)]">
                              {row.matter}
                            </td>
                            <td className="whitespace-nowrap text-[var(--iv-muted)]">
                              {row.deadline}
                            </td>
                            <td>
                              <Badge tone={row.tone}>{row.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
