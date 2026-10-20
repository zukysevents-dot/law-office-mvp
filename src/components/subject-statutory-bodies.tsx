import Link from "next/link";

import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateUtc } from "@/lib/format";
import { isCurrentStatutory } from "@/lib/subjects/statutory";
import { cn } from "@/lib/utils";

export type StatutoryBodyItem = {
  id: string | null;
  name: string;
  function: string | null;
  actingMethod: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  /** Only set when the current user may see the linked subject. */
  linkedSubject: { id: string; name: string } | null;
};

export type StatutoryRoleItem = {
  id: string;
  function: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  subject: { id: string; name: string };
};

function period(validFrom: Date | null, validTo: Date | null) {
  if (!validFrom && !validTo) return null;
  return `${validFrom ? `od ${formatDateUtc(validFrom)}` : ""}${
    validFrom && validTo ? " " : ""
  }${validTo ? `do ${formatDateUtc(validTo)}` : ""}`;
}

/** "Statutární orgány" of the subject + where it acts as one (back-links). */
export function SubjectStatutoryBodies({
  subjectId,
  bodies,
  roles,
  canEdit,
  showEmpty,
}: {
  subjectId: string;
  bodies: StatutoryBodyItem[];
  roles: StatutoryRoleItem[];
  canEdit: boolean;
  /** Render the section even without rows (companies). */
  showEmpty: boolean;
}) {
  return (
    <>
      {bodies.length > 0 || showEmpty ? (
        <Section title="Statutární orgány" id="statutarni-organy">
          {bodies.length > 0 ? (
            <ul className="grid gap-2">
              {bodies.map((body, index) => {
                const current = isCurrentStatutory(body);
                const when = period(body.validFrom, body.validTo);
                return (
                  <li
                    key={body.id ?? `legacy-${index}`}
                    className={cn(
                      "min-w-0 rounded-md border border-[#dce4e8] px-3 py-2",
                      current ? "bg-[#F4F7F8]" : "bg-white text-stone-500",
                    )}
                  >
                    <p className="flex flex-wrap items-center gap-2">
                      {body.linkedSubject ? (
                        <Link
                          href={`/subjects/${body.linkedSubject.id}`}
                          className="font-medium text-emerald-950 hover:underline"
                        >
                          {body.name}
                        </Link>
                      ) : (
                        <span className={cn("font-medium", current && "text-[#0e1822]")}>
                          {body.name}
                        </span>
                      )}
                      {body.function ? (
                        <span className="text-sm">{body.function}</span>
                      ) : null}
                      {!current ? <Badge>Bývalý</Badge> : null}
                    </p>
                    {when ? <p className="text-xs text-stone-500">{when}</p> : null}
                    {body.actingMethod ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                        Způsob jednání: {body.actingMethod}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState>Zatím nejsou evidovány žádné statutární orgány.</EmptyState>
          )}
          {canEdit ? (
            <p className="mt-3 text-sm">
              <Link
                href={`/subjects/${subjectId}/edit#statutarni-organy`}
                className="font-medium text-emerald-950 hover:underline"
              >
                Upravit statutární orgány
              </Link>
            </p>
          ) : null}
        </Section>
      ) : null}
      {roles.length > 0 ? (
        <Section title="Působí ve statutárních orgánech">
          <ul className="grid gap-2">
            {roles.map((role) => {
              const current = isCurrentStatutory(role);
              const when = period(role.validFrom, role.validTo);
              return (
                <li
                  key={role.id}
                  className={cn(
                    "min-w-0 rounded-md border border-[#dce4e8] px-3 py-2",
                    current ? "bg-[#F4F7F8]" : "bg-white text-stone-500",
                  )}
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/subjects/${role.subject.id}`}
                      className="font-medium text-emerald-950 hover:underline"
                    >
                      {role.subject.name}
                    </Link>
                    {role.function ? <span className="text-sm">{role.function}</span> : null}
                    {!current ? <Badge>Bývalý</Badge> : null}
                  </p>
                  {when ? <p className="text-xs text-stone-500">{when}</p> : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
