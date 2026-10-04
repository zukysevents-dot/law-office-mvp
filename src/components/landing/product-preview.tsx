import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  ListTodo,
  Clock3,
  Receipt,
  CalendarDays,
  AlertTriangle,
  FolderOpen,
  Radar,
  ShieldAlert,
  FileText,
  Inbox,
  BarChart3,
  AlarmClock,
  BriefcaseBusiness,
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

// Mirrors the real app navigation (src/components/app-sidebar.tsx) so the
// mockup shows what the product actually contains today.
const previewNavSections: {
  title: string;
  items: { label: string; icon: LucideIcon; active?: boolean }[];
}[] = [
  {
    title: "Přehled",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, active: true },
      { label: "Spisovna", icon: FolderOpen },
    ],
  },
  {
    title: "Spisy",
    items: [
      { label: "Subjekty", icon: Building2 },
      { label: "Conflict check", icon: ShieldCheck },
      { label: "Hlídání rejstříků", icon: Radar },
      { label: "AML / KYC", icon: ShieldAlert },
      { label: "Projekty", icon: BriefcaseBusiness },
      { label: "Případy", icon: FileText },
      { label: "Datové schránky", icon: Inbox },
    ],
  },
  {
    title: "Práce",
    items: [
      { label: "Úkoly", icon: ListTodo },
      { label: "Výkazy práce", icon: Clock3 },
      { label: "Fakturace", icon: Receipt },
      { label: "Reporty", icon: BarChart3 },
    ],
  },
  {
    title: "Lhůty & dokumenty",
    items: [
      { label: "Lhůtník", icon: AlarmClock },
      { label: "Kalendář", icon: CalendarDays },
    ],
  },
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
    matter: "Novák ./. Alfa banka a.s.",
    deadline: "12. 6.",
    status: "Po termínu",
    tone: "red",
  },
  {
    task: "Kontrola smlouvy o dílo",
    matter: "Stavby Beta s.r.o.",
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
    matter: "Agro Gama a.s.",
    deadline: "24. 6.",
    status: "Koncept",
    tone: "neutral",
  },
];

// Showcase of the monitoring modules (registry watch + data boxes) — the rows
// mimic what the real widgets render.
const previewRegistry: { subject: string; event: string; tone: BadgeTone; badge: string }[] = [
  {
    subject: "Stavby Beta s.r.o.",
    event: "Nový zápis v insolvenčním rejstříku",
    tone: "red",
    badge: "ISIR",
  },
  {
    subject: "Agro Gama a.s.",
    event: "Změna jednatele v obchodním rejstříku",
    tone: "amber",
    badge: "OR",
  },
];

const previewDataBoxes: { sender: string; subject: string; time: string; unread?: boolean }[] = [
  {
    sender: "Městský soud v Brně",
    subject: "Doručení usnesení, sp. zn. 12 C 45/2026",
    time: "dnes 9:12",
    unread: true,
  },
  {
    sender: "Finanční úřad pro Jihomoravský kraj",
    subject: "Výzva k součinnosti",
    time: "včera 14:03",
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
          lead="Od subjektů a conflict checku přes hlídání rejstříků a datové schránky až po výkazy, fakturaci a lhůtník. Bez přepínání mezi tabulkami, e‑maily a sdílenými disky."
        />

        <Reveal className="mt-12" variant="scale">
          {/* Browser-chrome frame. The whole mockup is decorative sample data,
              so it is exposed as a single image to assistive tech — otherwise
              screen readers would announce a fake data table and headings. */}
          <div
            role="img"
            aria-label="Ukázka dashboardu IURIVERSE: přehled úkolů, blížící se lhůty, hlídání rejstříků a datové schránky"
            className="overflow-hidden rounded-2xl border border-[var(--iv-line)] bg-white shadow-2xl shadow-[var(--iv-deep)]/15"
          >
            <div className="flex items-center gap-3 border-b border-[var(--iv-line)] bg-[var(--iv-bg)] px-4 py-3">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[var(--iv-line)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--iv-line)]" />
                <span className="h-3 w-3 rounded-full bg-[var(--iv-line)]" />
              </div>
              <div className="mx-auto flex max-w-xs flex-1 items-center justify-center rounded-md border border-[var(--iv-line)] bg-white px-3 py-1 text-xs text-[var(--iv-muted)]">
                app.iuriverse.com/dashboard
              </div>
              <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--iv-muted)] sm:inline">
                Ilustrační data
              </span>
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
                <nav className="mt-2 flex flex-col">
                  {previewNavSections.map((section) => (
                    <div key={section.title} className="mb-2">
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                        {section.title}
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {section.items.map((item) => (
                          <span
                            key={item.label}
                            className={
                              item.active
                                ? "flex items-center gap-2.5 rounded-md bg-[var(--iv-teal)] px-3 py-1.5 text-[13px] font-medium text-[var(--iv-deep)]"
                                : "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white/65"
                            }
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
              </aside>

              {/* Main panel */}
              <div className="min-w-0 flex-1 bg-[var(--iv-bg)]/50 p-5 sm:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold tracking-tight text-[var(--iv-ink)]">
                      Dashboard
                    </p>
                    <p className="mt-1 text-sm text-[var(--iv-muted)]">
                      Rychlý přehled aktivní práce, konfliktů a vytížení
                      kanceláře.
                    </p>
                  </div>
                  <span className="hidden shrink-0 items-center gap-2 rounded-md bg-[var(--iv-teal)] px-3 py-2 text-sm font-medium text-[var(--iv-deep)] sm:inline-flex">
                    Nastavit dashboard
                  </span>
                </div>

                <div
                  className="preview-cascade mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3"
                  style={{ animationDelay: "120ms" }}
                >
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

                <div
                  className="preview-cascade mt-4 rounded-lg border border-[var(--iv-line)] bg-white p-4 shadow-sm shadow-[var(--iv-deep)]/5 sm:p-5"
                  style={{ animationDelay: "240ms" }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-base font-semibold text-[var(--iv-ink)]">
                      Blížící se lhůty
                    </p>
                    <span className="text-xs font-medium text-[var(--iv-muted)]">
                      Procesní i interní
                    </span>
                  </div>
                  {/* tabIndex -1: Chromium makes overflow scrollers focusable,
                      which would violate aria-hidden-focus inside role="img". */}
                  <div className="table-scroll" tabIndex={-1}>
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

                <div
                  className="preview-cascade mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"
                  style={{ animationDelay: "360ms" }}
                >
                  <div className="rounded-lg border border-[var(--iv-line)] bg-white p-4 shadow-sm shadow-[var(--iv-deep)]/5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--iv-ink)]">
                        <Radar className="h-4 w-4 text-[var(--iv-teal)]" aria-hidden />
                        Hlídání rejstříků
                      </p>
                      <span className="text-xs font-medium text-[var(--iv-muted)]">
                        ISIR · OR
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2.5">
                      {previewRegistry.map((row) => (
                        <li key={row.subject} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--iv-ink)]">
                              {row.subject}
                            </p>
                            <p className="truncate text-xs text-[var(--iv-muted)]">
                              {row.event}
                            </p>
                          </div>
                          <Badge tone={row.tone}>{row.badge}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[var(--iv-line)] bg-white p-4 shadow-sm shadow-[var(--iv-deep)]/5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--iv-ink)]">
                        <Inbox className="h-4 w-4 text-[var(--iv-teal)]" aria-hidden />
                        Datové schránky
                      </p>
                      <span className="text-xs font-medium text-[var(--iv-muted)]">
                        1 nepřečtená
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2.5">
                      {previewDataBoxes.map((row) => (
                        <li key={row.subject} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "truncate text-sm text-[var(--iv-ink)]",
                                row.unread ? "font-semibold" : "font-medium",
                              )}
                            >
                              {row.sender}
                            </p>
                            <p className="truncate text-xs text-[var(--iv-muted)]">
                              {row.subject}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-[var(--iv-muted)]">
                            {row.time}
                          </span>
                        </li>
                      ))}
                    </ul>
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
