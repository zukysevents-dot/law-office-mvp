import { ButtonLink } from "law-office-mvp";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <ButtonLink href="#" variant="primary">
      Otevřít spis
    </ButtonLink>
    <ButtonLink href="#" variant="secondary">
      Detail
    </ButtonLink>
    <ButtonLink href="#" variant="ghost">
      Zpět na přehled
    </ButtonLink>
  </div>
);
