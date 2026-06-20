import Image from "next/image";
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

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { Reveal } from "@/components/landing/reveal";
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
      className="scroll-mt-24 py-20 sm:py-24 lg:py-28"
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
          <div className="overflow-hidden rounded-2xl border border-[#d4e2dc] bg-white shadow-xl shadow-[#072924]/10">
            <div className="flex items-center gap-3 border-b border-[#d4e2dc] bg-[#eef5f1] px-4 py-3">
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[#d4e2dc]" />
                <span className="h-3 w-3 rounded-full bg-[#d4e2dc]" />
                <span className="h-3 w-3 rounded-full bg-[#d4e2dc]" />
              </div>
              <div className="mx-auto flex max-w-xs flex-1 items-center justify-center rounded-md border border-[#d4e2dc] bg-white px-3 py-1 text-xs text-[#5f756e]">
                syndikat.legal/dashboard
              </div>
            </div>

            <div className="flex">
              {/* Mini sidebar (hidden on small screens) */}
              <aside className="hidden w-56 shrink-0 flex-col bg-[#072924] p-3 md:flex">
                <div className="flex h-12 items-center px-2">
                  <Image
                    src="/brand/logo-light.jpeg"
                    alt="syndikat.legal"
                    width={1017}
                    height={324}
                    className="h-7 w-auto max-w-[150px] rounded object-contain"
                  />
                </div>
                <nav className="mt-3 flex flex-col gap-1" aria-hidden>
                  {previewNav.map((item) => (
                    <span
                      key={item.label}
                      className={
                        item.active
                          ? "flex items-center gap-3 rounded-md bg-[#B9DCC6] px-3 py-2 text-sm font-medium text-[#072924]"
                          : "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-[#d8eee0]"
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                  ))}
                </nav>
              </aside>

              {/* Main panel */}
              <div className="min-w-0 flex-1 bg-[#eef5f1]/40 p-5 sm:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-[#072924]">
                      Dashboard
                    </h3>
                    <p className="mt-1 text-sm text-[#5f756e]">
                      Rychlý přehled aktivní práce, konfliktů a vytížení
                      kanceláře.
                    </p>
                  </div>
                  <span className="hidden shrink-0 items-center gap-2 rounded-md border border-[#B9DCC6] bg-[#B9DCC6] px-3 py-2 text-sm font-medium text-[#072924] sm:inline-flex">
                    Nastavit dashboard
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <StatCard label="Aktivní úkoly" value={128} icon={ListTodo} />
                  <StatCard
                    label="Po termínu"
                    value={3}
                    icon={AlertTriangle}
                    tone="danger"
                  />
                  <StatCard
                    label="Hodiny tento měsíc"
                    value="146,5"
                    icon={Clock3}
                  />
                </div>

                <div className="mt-4 rounded-lg border border-[#d4e2dc] bg-white p-4 shadow-sm shadow-[#072924]/5 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[#072924]">
                      Nadcházející lhůty
                    </h4>
                    <span className="text-xs font-medium text-[#5f756e]">
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
                            <td className="font-medium text-[#072924]">
                              {row.task}
                            </td>
                            <td className="text-[#5f756e]">{row.matter}</td>
                            <td className="whitespace-nowrap text-[#5f756e]">
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
