import { Badge } from "law-office-mvp";

export const Tones = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge tone="neutral">Koncept</Badge>
    <Badge tone="mint">Aktivní</Badge>
    <Badge tone="dark">Prioritní</Badge>
    <Badge tone="green">Vyřízeno</Badge>
    <Badge tone="amber">Čeká</Badge>
    <Badge tone="red">Po termínu</Badge>
    <Badge tone="blue">Konzultace</Badge>
    <Badge tone="purple">Archiv</Badge>
  </div>
);
