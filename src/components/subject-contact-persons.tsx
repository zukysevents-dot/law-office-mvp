import {
  createContactPerson,
  removeContactPerson,
} from "@/app/actions/contact-persons";
import { Field, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  project: { name: string } | null;
  case: { name: string } | null;
};

export function SubjectContactPersons({
  subjectId,
  contacts,
  projects,
  cases,
  canEdit,
}: {
  subjectId: string;
  contacts: Contact[];
  projects: Array<{ id: string; name: string }>;
  cases: Array<{ id: string; name: string; project: { name: string } }>;
  canEdit: boolean;
}) {
  return (
    <Section title="Kontaktní osoby">
      {contacts.length > 0 ? (
        <div className="table-scroll">
          <table className="w-max min-w-full">
            <thead>
              <tr>
                <th>Jméno</th>
                <th>Role</th>
                <th>E-mail</th>
                <th>Telefon</th>
                <th>Projekt / případ</th>
                {canEdit ? <th>Akce</th> : null}
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="font-medium text-emerald-950">
                    {contact.firstName} {contact.lastName}
                  </td>
                  <td>{contact.role ?? "—"}</td>
                  <td>
                    {contact.email ? (
                      <a
                        href={`mailto:${encodeURIComponent(contact.email)}`}
                        className="text-emerald-950 hover:underline"
                      >
                        {contact.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{contact.phone ?? "—"}</td>
                  <td>{contact.case?.name ?? contact.project?.name ?? "—"}</td>
                  {canEdit ? (
                    <td>
                      <form action={removeContactPerson}>
                        <input type="hidden" name="id" value={contact.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          className="h-8 px-3"
                        >
                          Odebrat
                        </Button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>Zatím nejsou žádné kontaktní osoby.</EmptyState>
      )}
      {canEdit ? (
        <form action={createContactPerson} className="mt-6 grid gap-4">
          <input type="hidden" name="subjectId" value={subjectId} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Jméno">
              <TextInput name="firstName" required />
            </Field>
            <Field label="Příjmení">
              <TextInput name="lastName" required />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="E-mail">
              <TextInput name="email" type="email" />
            </Field>
            <Field label="Telefon">
              <TextInput name="phone" />
            </Field>
            <Field label="Role">
              <TextInput name="role" placeholder="zaměstnanec, jednatel…" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Projekt (volitelně)">
              <SelectInput name="projectId">
                <option value="">Bez vazby</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Případ (volitelně)">
              <SelectInput name="caseId">
                <option value="">Bez vazby</option>
                {cases.map((legalCase) => (
                  <option key={legalCase.id} value={legalCase.id}>
                    {legalCase.name} / {legalCase.project.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field label="Poznámka">
            <TextArea name="note" />
          </Field>
          <div>
            <Button type="submit">Přidat kontaktní osobu</Button>
          </div>
        </form>
      ) : null}
    </Section>
  );
}
