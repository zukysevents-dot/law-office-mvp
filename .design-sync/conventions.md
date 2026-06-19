# Law Office UI — usage conventions

A small set of React UI primitives from an internal Czech-language law-office app.
Import every component from `window.LawOfficeUI` (the root `_ds_bundle.js`). The UI
language is **Czech** — labels, placeholders, and copy should be Czech.

## Styling model — style via PROPS, not class names

These components carry their own Tailwind styling internally. You do **not** restyle
them with utility classes. Drive their appearance through props:

- `Button` / `ButtonLink` — `variant`: `'primary'` (brand green), `'secondary'` (mint),
  `'ghost'` (outlined), `'danger'` (red).
- `Badge` — `tone`: `'neutral' | 'mint' | 'dark' | 'green' | 'amber' | 'red' | 'blue' | 'purple'`.
- `StatCard` — `tone`: `'mint'` (default) or `'danger'`; pass any Lucide-style icon
  component as `icon`.

Every component also accepts a `className` for layout glue only (margins, grid placement).

## Brand palette (CSS variables, defined in `styles.css`)

Use these for your own surrounding layout — never invent off-brand colors:

| Variable | Value | Use |
|---|---|---|
| `--brand-dark` | `#072924` | primary green: headings, primary actions, key numbers |
| `--brand-mint` | `#b9dcc6` | accent / secondary surfaces |
| `--brand-bg` | `#eef5f1` | page canvas |
| `--muted` `#5f756e` · `--line` `#d4e2dc` · `--panel` `#ffffff` | | secondary text · borders · cards |

Reference them as `style={{ color: 'var(--brand-dark)' }}` or arbitrary Tailwind
(`text-[#072924]`). There are no `bg-brand-*` utility classes. Font is **Geist**.

## Where the truth lives

Read these before composing: `styles.css` and its `@import`s (tokens + `_ds_bundle.css`),
and each component's `<Name>.d.ts` (API) + `<Name>.prompt.md` (usage).

## Idiomatic snippet

```tsx
const { PageHeader, Button, Section, Field, TextInput, Badge } = window.LawOfficeUI;

<div style={{ background: 'var(--brand-bg)', padding: 24 }}>
  <PageHeader
    title="Spisy"
    description="Přehled aktivních spisů kanceláře."
    action={<Button variant="primary">Nový spis</Button>}
  />
  <Section title="Základní údaje" className="mt-6">
    <Field label="Spisová značka">
      <TextInput defaultValue="2026/0142" />
    </Field>
    <Badge tone="amber">Čeká na vyjádření</Badge>
  </Section>
</div>
```
