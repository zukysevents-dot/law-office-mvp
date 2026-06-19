# design-sync notes — law-office-mvp

This repo is a **Next.js app, not a packaged design system**. The sync scopes only the
generic UI primitives (12 exports) and builds a mini-library for them off-script.

## Build (off-script)

There is no library `dist/`. `cfg.buildCmd` produces both artifacts the converter needs:

- `dist/ds.es.js` — esbuild bundle of `.design-sync/lib-src/index.tsx`, which re-exports
  the real primitives from `src/components/**`. React/react-dom/lucide-react are external;
  `@/` is aliased to `src/`; `next/link` is aliased to `.design-sync/lib-src/next-link-shim.tsx`
  (a plain `<a>`) so `Button`/`ButtonLink` render outside Next.
- `dist/ds.css` — Tailwind v4 CLI compiled from `.design-sync/lib-src/styles.in.css`, which
  `@source`s the component files + `.design-sync/previews/**` and mirrors the brand tokens
  from `src/app/globals.css`. Only used utilities ship.

Run order is wired into `cfg.buildCmd`; the converter is then run with
`--entry ./dist/ds.es.js --out ./ds-bundle` and `--node-modules ./node_modules`.

## Components (all on authored previews, all graded good)

Button, ButtonLink, Badge, EmptyState, DatabaseNotice, PageHeader, Section, StatCard,
Field, TextInput, SelectInput, TextArea. `badgeToneClasses` is a non-component export
(camelCase → not a card).

## Decisions / gotchas

- **`.d.ts` props are hand-written** in `cfg.dtsPropsFor` — the inline intersection types
  (`ButtonHTMLAttributes & {variant}`) collapsed to an index signature on auto-extraction.
  If you add/change a primitive's props, update `dtsPropsFor` to match the source.
- **StatCard icon**: previews pass an inline SVG component (not lucide) so no icon dep is
  bundled. The prop type is `React.ComponentType<{className?: string}>`.
- **Font Geist** is served via a Google Fonts `@import` in `styles.in.css` → validate reports
  `[FONT_REMOTE]` (informational, non-blocking). The app itself loads Geist via
  `next/font/google`; this is the runtime-webfont equivalent.

## Known render warns

- `[FONT_REMOTE]` for Geist families — expected, see above.

## Re-sync risks (watch-list)

- Brand tokens in `.design-sync/lib-src/styles.in.css` are a **mirror** of
  `src/app/globals.css` `:root`/`@theme`. If the app's brand palette changes, update the
  input CSS too — it will not auto-follow.
- `cfg.componentSrcMap` / `cfg.dtsPropsFor` are pinned to current source paths and shapes.
  Moving or restructuring `src/components/**`, or changing a primitive's props, requires
  updating both.
- `next-link-shim.tsx` mirrors next/link's rendered `<a>`. If the app's Button starts using
  next/link features beyond `href`, revisit the shim.
- New primitives added to `src/components/ui/**` are NOT auto-included — add them to
  `lib-src/index.tsx`, `componentSrcMap`, `dtsPropsFor`, the `@source` list, and author a
  preview.
