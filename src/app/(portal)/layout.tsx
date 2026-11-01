import { Suspense } from "react";

import { NavigationProgress } from "@/components/navigation-progress";

// No route-level loading.tsx here on purpose — see src/app/loading-boundaries.test.ts.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#portal-main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0e1822] shadow-lg transition focus:translate-y-0"
      >
        Přeskočit na obsah
      </a>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {children}
    </>
  );
}
