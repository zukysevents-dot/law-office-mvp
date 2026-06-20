import { Section } from "law-office-mvp";

export const WithTitle = () => (
  <Section title="Základní údaje">
    <p style={{ margin: 0, fontSize: 14, color: "#5f756e", lineHeight: 1.6 }}>
      Spisová značka, odpovědný advokát a stav řízení. Sekce sdružuje
      související pole do přehledného panelu.
    </p>
  </Section>
);

export const Untitled = () => (
  <Section>
    <p style={{ margin: 0, fontSize: 14, color: "#072924" }}>
      Panel bez nadpisu — vhodný pro volný obsah.
    </p>
  </Section>
);
