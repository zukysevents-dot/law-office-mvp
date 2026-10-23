import Link from "next/link";

import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SubjectContactType } from "@/generated/prisma/enums";
import { subjectContactTypeLabels } from "@/lib/labels";
import { contactHref } from "@/lib/subjects/contacts";

export type SubjectContactItem = {
  id: string | null;
  type: SubjectContactType | string;
  value: string;
  label: string | null;
  isPrimary: boolean;
};

const typeOrder: string[] = [
  SubjectContactType.EMAIL,
  SubjectContactType.PHONE,
  SubjectContactType.DATA_BOX,
  SubjectContactType.WEB,
  SubjectContactType.OTHER,
];

/** "Kontaktní údaje" on the subject detail: all channels, safe links only. */
export function SubjectContactsList({
  subjectId,
  contacts,
  canEdit,
}: {
  subjectId: string;
  contacts: SubjectContactItem[];
  canEdit: boolean;
}) {
  const sorted = [...contacts].sort(
    (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type),
  );

  return (
    <Section title="Kontaktní údaje" id="kontaktni-udaje">
      {sorted.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sorted.map((contact, index) => {
            const href = contactHref(contact.type, contact.value);
            const external = contact.type === SubjectContactType.WEB;
            return (
              <li
                key={contact.id ?? `legacy-${index}`}
                className="min-w-0 rounded-md border border-[#dce4e8] bg-[#F4F7F8] px-3 py-2"
              >
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-stone-500">
                  {subjectContactTypeLabels[contact.type as SubjectContactType] ??
                    contact.type}
                  {contact.label ? (
                    <span className="normal-case text-stone-600">· {contact.label}</span>
                  ) : null}
                  {contact.isPrimary ? <Badge tone="mint">Hlavní</Badge> : null}
                </p>
                {href ? (
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                    className="break-all font-medium text-emerald-950 hover:underline"
                  >
                    {contact.value}
                  </a>
                ) : (
                  <p className="break-all font-medium">{contact.value}</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>Zatím nejsou evidovány žádné kontaktní údaje.</EmptyState>
      )}
      {canEdit ? (
        <p className="mt-3 text-sm">
          <Link
            href={`/subjects/${subjectId}/edit#kontakty`}
            className="font-medium text-emerald-950 hover:underline"
          >
            Upravit kontakty
          </Link>
        </p>
      ) : null}
    </Section>
  );
}
