import { Field, TextInput, SelectInput } from "law-office-mvp";

export const WithInput = () => (
  <div style={{ display: "grid", gap: 16, maxWidth: 360 }}>
    <Field label="Spisová značka">
      <TextInput defaultValue="2026/0142" placeholder="Zadejte značku" />
    </Field>
    <Field label="Stav řízení">
      <SelectInput defaultValue="active">
        <option value="active">Aktivní</option>
        <option value="pending">Čeká</option>
        <option value="closed">Uzavřeno</option>
      </SelectInput>
    </Field>
  </div>
);
