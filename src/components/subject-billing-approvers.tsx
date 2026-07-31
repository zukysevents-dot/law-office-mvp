import {
  addSubjectBillingApprover,
  removeSubjectBillingApprover,
} from "@/app/actions/subject-billing-approvers";
import { Field, SelectInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type Person = { id: string; name: string };
type Approver = { id: string; user: Person };

export function SubjectBillingApprovers({
  subjectId,
  members,
  approvers,
}: {
  subjectId: string;
  members: Person[];
  approvers: Approver[];
}) {
  const selectedIds = new Set(approvers.map((approver) => approver.user.id));
  const available = members.filter((member) => !selectedIds.has(member.id));

  return (
    <Section title="Osoby odpovědné za fakturaci">
      <p className="mb-4 text-sm text-[#5f756e]">
        Tito uživatelé mohou schvalovat výkazy tohoto klienta. ADMIN a PARTNER
        mohou schvalovat vždy, i bez výslovného přiřazení.
      </p>
      {approvers.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {approvers.map((approver) => (
            <form key={approver.id} action={removeSubjectBillingApprover}>
              <input type="hidden" name="id" value={approver.id} />
              <Badge tone="mint">
                {approver.user.name}
                <button
                  type="submit"
                  className="ml-2 rounded px-1 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#072924]"
                  aria-label={`Odebrat schvalovatele ${approver.user.name}`}
                >
                  ×
                </button>
              </Badge>
            </form>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <EmptyState>
            Nejsou přidáni další schvalovatelé; platí oprávnění ADMIN/PARTNER.
          </EmptyState>
        </div>
      )}
      {available.length > 0 ? (
        <form
          action={addSubjectBillingApprover}
          className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="subjectId" value={subjectId} />
          <Field label="Přidat schvalovatele">
            <SelectInput name="userId" required>
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Button type="submit">Přidat</Button>
        </form>
      ) : null}
    </Section>
  );
}
