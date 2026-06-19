import { PageHeader, Button } from "law-office-mvp";

export const WithAction = () => (
  <PageHeader
    title="Spisy"
    description="Přehled všech aktivních spisů advokátní kanceláře, jejich stavu a odpovědných osob."
    action={<Button variant="primary">Nový spis</Button>}
  />
);

export const TitleOnly = () => <PageHeader title="Nastavení" />;
