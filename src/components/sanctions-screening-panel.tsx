import {
  decideSanctionsMatch,
  runSanctionsScreening,
} from "@/app/actions/sanctions";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export type SanctionsMatchRow = {
  id: string;
  matchedName: string;
  score: number;
  decision: string;
  decisionNote: string | null;
};

export type ScreeningWithMatches = {
  id: string;
  queryName: string;
  status: string;
  reviewOutcome: string | null;
  candidateCount: number;
  createdAt: Date;
  matches: SanctionsMatchRow[];
};

const decisionLabels: Record<string, string> = {
  PENDING: "Čeká na posouzení",
  CONFIRMED: "Potvrzeno",
  DISMISSED: "Zamítnuto",
};

// AML sanctions screening panel on the subject detail. The screening only
// SUGGESTS candidates — confirming one does not flag the subject; the lawyer
// must set "Sankce" in the risk assessment above (per the "lawyer decides" rule).
export function SanctionsScreeningPanel({
  subjectId,
  screening,
}: {
  subjectId: string;
  screening: ScreeningWithMatches | null;
}) {
  const hasConfirmed = screening?.matches.some(
    (match) => match.decision === "CONFIRMED",
  );

  return (
    <Section title="AML — sankční screening">
      <p className="mb-4 text-sm text-stone-600">
        Screening porovná jméno klienta s EU konsolidovaným sankčním seznamem a{" "}
        <strong>navrhne možné shody ke kontrole</strong>. O případné shodě a
        riziku rozhoduje advokát — potvrzení kandidáta níže pouze upozorní, ať
        zaškrtnete „Sankce“ v hodnocení rizik výše.
      </p>

      {screening ? (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
            <span>
              Poslední screening: <strong>{formatDate(screening.createdAt)}</strong>
            </span>
            <Badge tone={screening.candidateCount > 0 ? "amber" : "green"}>
              {screening.candidateCount > 0
                ? `${screening.candidateCount} možných shod`
                : "Bez shody na seznamu"}
            </Badge>
          </div>

          {screening.matches.length > 0 ? (
            <div className="table-scroll">
              <table className="w-max min-w-full">
                <thead>
                  <tr>
                    <th>Jméno na seznamu</th>
                    <th>Shoda</th>
                    <th>Stav</th>
                    <th>Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {screening.matches.map((match) => (
                    <tr key={match.id}>
                      <td className="font-medium text-stone-950">
                        {match.matchedName}
                      </td>
                      <td>{Math.round(match.score * 100)} %</td>
                      <td>{decisionLabels[match.decision] ?? match.decision}</td>
                      <td>
                        {match.decision === "PENDING" ? (
                          <div className="flex gap-2">
                            <form action={decideSanctionsMatch}>
                              <input type="hidden" name="matchId" value={match.id} />
                              <input type="hidden" name="decision" value="CONFIRMED" />
                              <Button type="submit" variant="secondary">
                                Potvrdit
                              </Button>
                            </form>
                            <form action={decideSanctionsMatch}>
                              <input type="hidden" name="matchId" value={match.id} />
                              <input type="hidden" name="decision" value="DISMISSED" />
                              <Button type="submit" variant="ghost">
                                Zamítnout
                              </Button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {hasConfirmed ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Potvrzena shoda na sankčním seznamu. Zaznamenejte ji zaškrtnutím
              „Sankce“ v hodnocení rizik výše.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mb-4 text-sm text-stone-600">
          Screening zatím nebyl spuštěn.
        </p>
      )}

      <form action={runSanctionsScreening}>
        <input type="hidden" name="subjectId" value={subjectId} />
        <Button type="submit">Spustit sankční screening</Button>
      </form>
    </Section>
  );
}
