import { AppShell } from "@/components/app-shell";

// IMPORTANT: this route group deliberately has NO loading.tsx. On Next 16.2.9
// a route-level loading boundary made every same-URL router refresh (i.e. the
// re-render after a server action's revalidatePath, and router.refresh()) hang
// on content-heavy pages until a manual reload, and added ~700 ms to every
// navigation. Feedback comes from NavigationProgress + pending submit buttons
// instead. Guarded by src/app/loading-boundaries.test.ts; details in
// tests/e2e/README.md ("Známá omezení"). Need streaming? Use a local
// <Suspense> around the slow sub-tree, never a route-level loading.tsx.
export default function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
