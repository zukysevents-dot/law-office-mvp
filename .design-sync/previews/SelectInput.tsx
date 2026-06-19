import { SelectInput } from "law-office-mvp";

export const Default = () => (
  <div style={{ maxWidth: 360 }}>
    <SelectInput defaultValue="lawyer">
      <option value="lawyer">Advokát</option>
      <option value="trainee">Koncipient</option>
      <option value="intern">Stážista</option>
    </SelectInput>
  </div>
);
