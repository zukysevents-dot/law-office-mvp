import { TextArea } from "law-office-mvp";

export const States = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
    <TextArea placeholder="Poznámka ke spisu…" rows={3} />
    <TextArea
      rows={3}
      defaultValue="Klient dodal podklady, čekáme na vyjádření protistrany do 30. 6. 2026."
    />
  </div>
);
