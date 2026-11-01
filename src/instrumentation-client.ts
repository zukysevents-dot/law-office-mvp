// Client instrumentation (Next 16, runs before hydration). Kept deliberately
// tiny: it only forwards the router's "navigation started" signal to a DOM
// event that the NavigationProgress bar listens to. Route-level loading.tsx
// boundaries are not used in this app (see src/app/loading-boundaries.test.ts),
// so this bar is the visual feedback for client-side navigations.
import { NAVIGATION_START_EVENT } from "@/lib/navigation-events";

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  try {
    window.dispatchEvent(
      new CustomEvent(NAVIGATION_START_EVENT, {
        detail: { url, navigationType },
      }),
    );
  } catch {
    // Instrumentation must never break navigation.
  }
}
