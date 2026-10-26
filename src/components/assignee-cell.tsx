import { Field, SelectInput } from "@/components/form-field";
import { summarizeLabels } from "@/lib/assignments";

// Buňka „Řešitelé“ v seznamech projektů a případů: týmy a osoby (nejvýš 3 +
// „+N“, celý seznam v title), u případu šedě i řešitelé zdědění z projektu.
export function AssigneeCell({
  labels,
  inheritedLabels = [],
}: {
  labels: readonly string[];
  inheritedLabels?: readonly string[];
}) {
  if (labels.length === 0 && inheritedLabels.length === 0) {
    return <span className="text-stone-500">—</span>;
  }
  const own = summarizeLabels(labels);
  const inherited = summarizeLabels(inheritedLabels, 2);
  return (
    <span
      className="block max-w-xs"
      title={[...labels, ...inheritedLabels.map((label) => `z projektu: ${label}`)].join(", ")}
    >
      {own.shown.length > 0 ? (
        <span className="block">
          {own.shown.join(" · ")}
          {own.rest > 0 ? ` +${own.rest}` : ""}
        </span>
      ) : null}
      {inherited.shown.length > 0 ? (
        <span className="block text-xs text-stone-500">
          z projektu: {inherited.shown.join(" · ")}
          {inherited.rest > 0 ? ` +${inherited.rest}` : ""}
        </span>
      ) : null}
    </span>
  );
}

// Filtr „Řešitel“ v seznamech (GET formulář): Kdokoli / Já / Bez řešitelů /
// konkrétní tým / konkrétní osoba.
export function AssigneeFilterField({
  value,
  teams,
  users,
  label = "Řešitel",
}: {
  value: string;
  teams: ReadonlyArray<{ id: string; name: string }>;
  users: ReadonlyArray<{ id: string; name: string }>;
  label?: string;
}) {
  return (
    <Field label={label}>
      <SelectInput name="assignee" defaultValue={value}>
        <option value="">Kdokoli</option>
        <option value="me">Já (odpovídám nebo řeším)</option>
        <option value="none">Bez řešitelů</option>
        {teams.length > 0 ? (
          <optgroup label="Týmy">
            {teams.map((team) => (
              <option key={team.id} value={`team:${team.id}`}>
                {team.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {users.length > 0 ? (
          <optgroup label="Osoby">
            {users.map((user) => (
              <option key={user.id} value={`user:${user.id}`}>
                {user.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </SelectInput>
    </Field>
  );
}

// Volitelný tým řešitelů ve formuláři „Nový projekt“ / „Nový případ“.
export function TeamSelectField({
  teams,
  hint,
}: {
  teams: ReadonlyArray<{ id: string; name: string }>;
  hint: string;
}) {
  if (teams.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1">
      <Field label="Tým řešitelů">
        <SelectInput name="legalTeamId" defaultValue="">
          <option value="">Bez týmu</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </SelectInput>
      </Field>
      <p className="text-xs text-stone-600">{hint}</p>
    </div>
  );
}
