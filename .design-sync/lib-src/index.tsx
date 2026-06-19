// Design-system entry for design-sync.
// Re-exports the law-office UI primitives from their real source — no reimplementation.
// `@/` resolves to repo `src/` (esbuild alias); `next/link` is aliased to a plain <a> shim
// so Button/ButtonLink render outside Next.js (see ../lib-src/next-link-shim.tsx).
export { Button, ButtonLink } from "@/components/ui/button";
export { Badge, badgeToneClasses } from "@/components/ui/badge";
export { EmptyState } from "@/components/ui/empty-state";
export { DatabaseNotice } from "@/components/ui/database-notice";
export { PageHeader } from "@/components/page-header";
export { Section } from "@/components/section";
export { StatCard } from "@/components/stat-card";
export { Field, TextInput, SelectInput, TextArea } from "@/components/form-field";
