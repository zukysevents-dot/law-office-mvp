import { Button } from "law-office-mvp";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button variant="primary">Uložit</Button>
    <Button variant="secondary">Zpět</Button>
    <Button variant="ghost">Zrušit</Button>
    <Button variant="danger">Smazat</Button>
  </div>
);

export const Disabled = () => (
  <Button variant="primary" disabled>
    Ukládání…
  </Button>
);
