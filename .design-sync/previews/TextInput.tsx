import { TextInput } from "law-office-mvp";

export const States = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
    <TextInput placeholder="Jméno klienta" />
    <TextInput defaultValue="Jan Novák" />
    <TextInput defaultValue="Nelze upravit" disabled />
  </div>
);
