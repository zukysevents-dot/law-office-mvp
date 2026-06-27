import { Finding, Skip } from "../lib/findings";

export interface QueryCounterResult {
  findings: Finding[];
  skips: Skip[];
  passes: number;
  notes: string[];
}

// Maximum DB round-trips we tolerate per list query shape. Prisma may split a
// query with includes into a small constant number of statements; a per-row
// (N+1) pattern blows far past this. Kept lenient to avoid false positives.
const MAX_QUERIES_PER_SHAPE = 4;

const RULE = "perf/n+1-db-counter";

// Best-effort, DB-backed N+1 detector. Connects ONLY when DATABASE_URL_TEST is
// set; otherwise it SKIPs (reported as skipped — never a fake green). When a DB
// is present it counts the real number of statements Prisma issues for a few
// representative list shapes and flags any that explode. A missing table or an
// adapter that doesn't emit query events also yields an honest SKIP, not a pass.
export async function runQueryCounter(): Promise<QueryCounterResult> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    return {
      findings: [],
      skips: [
        {
          rule: RULE,
          reason:
            "DATABASE_URL_TEST není nastaven — DB-backed měření počtu dotazů (N+1) přeskočeno. SKIP ≠ zelená.",
        },
      ],
      passes: 0,
      notes: [
        "Pro reálné měření: `DATABASE_URL_TEST=postgres://… npm run gate:a6` proti naseedované test DB.",
      ],
    };
  }

  try {
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const adapter = new PrismaPg({ connectionString: url });
    const prisma = new PrismaClient({
      adapter,
      log: [{ emit: "event", level: "query" }],
    });

    let count = 0;
    // Cast keeps us decoupled from the generated event typings.
    (prisma as unknown as { $on: (e: string, cb: () => void) => void }).$on(
      "query",
      () => {
        count += 1;
      },
    );

    // Connectivity + "are query events actually wired?" probe.
    await prisma.$queryRaw`SELECT 1`;
    if (count === 0) {
      await prisma.$disconnect();
      return {
        findings: [],
        skips: [
          {
            rule: RULE,
            reason:
              "Query eventy se s tímto adapterem neemitují — počítání dotazů nelze ověřit. SKIP ≠ zelená.",
          },
        ],
        passes: 0,
        notes: [],
      };
    }

    const shapes: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: "subjects (list)",
        run: () => prisma.subject.findMany({ take: 25 }),
      },
      {
        name: "projects (list + relace)",
        run: () =>
          prisma.project.findMany({
            take: 25,
            include: { mainSubject: true, responsibleUser: true },
          }),
      },
      {
        name: "cases (list + relace)",
        run: () =>
          prisma.case.findMany({
            take: 25,
            include: { project: true, responsibleUser: true },
          }),
      },
    ];

    const findings: Finding[] = [];
    const skips: Skip[] = [];
    let passes = 0;

    for (const shape of shapes) {
      const before = count;
      try {
        await shape.run();
      } catch (error) {
        skips.push({
          rule: `${RULE}:${shape.name}`,
          reason: `Tvar přeskočen (tabulka/migrace nepřipravená): ${shortError(error)}`,
        });
        continue;
      }
      const used = count - before;
      if (used > MAX_QUERIES_PER_SHAPE) {
        findings.push({
          rule: "perf/n+1",
          severity: "MEDIUM",
          message: `Tvar „${shape.name}" vyvolal ${used} DB dotazů (> ${MAX_QUERIES_PER_SHAPE}) — pravděpodobný N+1.`,
        });
      } else {
        passes += 1;
      }
    }

    await prisma.$disconnect();
    return {
      findings,
      skips,
      passes,
      notes: [`DB query-counter proběhl proti DATABASE_URL_TEST (${shapes.length} tvarů).`],
    };
  } catch (error) {
    return {
      findings: [],
      skips: [
        {
          rule: RULE,
          reason: `DB nedostupná/nepřipravená — měření přeskočeno: ${shortError(error)}`,
        },
      ],
      passes: 0,
      notes: [],
    };
  }
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0]?.slice(0, 160) ?? "neznámá chyba";
}
