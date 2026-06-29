import { UserPlus, X } from "lucide-react";

import { Field, SelectInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type Assignee = { id: string; user: { id: string; name: string } };
type Candidate = { id: string; name: string };

// Sdílená sekce „Řešitelé" pro detail projektu i případu (vzor jako kontaktní
// osoby). Seznam přiřazených + (když canEdit) přidání/odebrání. Add/remove
// akce a název pole rodiče se předávají z volajícího, ať komponenta slouží pro
// Project (projectId) i Case (caseId).
export function AssigneeSection({
  title,
  assignees,
  candidates,
  parentField,
  parentId,
  addAction,
  removeAction,
  canEdit,
}: {
  title: string;
  assignees: Assignee[];
  candidates: Candidate[];
  parentField: "projectId" | "caseId";
  parentId: string;
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  canEdit: boolean;
}) {
  const assignedIds = new Set(assignees.map((assignee) => assignee.user.id));
  const available = candidates.filter(
    (candidate) => !assignedIds.has(candidate.id),
  );

  return (
    <Section title={title}>
      <p className="mb-3 text-sm text-stone-600">
        Doplňkoví řešitelé vedle odpovědné osoby. Přiřazení uvidí tento záznam i
        navázaná data; advokát ho může i upravovat.
      </p>
      {assignees.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {assignees.map((assignee) => (
            <li
              key={assignee.id}
              className="flex items-center gap-2 rounded-md border border-[#d4e2dc] bg-[#EEF5F1]/55 px-3 py-1.5 text-sm"
            >
              <span className="font-medium text-[#072924]">
                {assignee.user.name}
              </span>
              {canEdit ? (
                <form action={removeAction}>
                  <input type="hidden" name="id" value={assignee.id} />
                  <button
                    type="submit"
                    aria-label={`Odebrat řešitele ${assignee.user.name}`}
                    className="text-stone-500 transition-colors hover:text-red-700"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Zatím bez dalších řešitelů.</EmptyState>
      )}
      {canEdit && available.length > 0 ? (
        <form
          action={addAction}
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <input type="hidden" name={parentField} value={parentId} />
          <Field label="Přidat řešitele">
            <SelectInput name="userId" required>
              <option value="">Vyberte uživatele</option>
              {available.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit" variant="secondary" className="self-end">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Přidat
          </Button>
        </form>
      ) : null}
    </Section>
  );
}
