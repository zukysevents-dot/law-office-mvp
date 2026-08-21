import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { isLandingOnlyHost } from "@/lib/landing-mode";
import { MarketingHeader } from "@/components/landing/marketing-header";
import { Hero } from "@/components/landing/hero";
import { ProductPreview } from "@/components/landing/product-preview";
import { Problem } from "@/components/landing/problem";
import { Solution } from "@/components/landing/solution";
import { FeaturesGrid } from "@/components/landing/features-grid";
import { Workflow } from "@/components/landing/workflow";
import { Trust } from "@/components/landing/trust";
import { Benefits } from "@/components/landing/benefits";
import { FinalCta } from "@/components/landing/final-cta";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata: Metadata = {
  title: "IURIVERSE — softwarový systém pro advokátní kancelář",
  description:
    "Evidence subjektů, kontrola střetu zájmů, lhůty, výkazy práce a fakturace v jednom bezpečném a auditovatelném systému pro advokátní kanceláře.",
  openGraph: {
    title: "IURIVERSE — celá advokátní kancelář v jednom systému",
    description:
      "Subjekty, conflict check, lhůty, výkazy práce a fakturace — propojené, bezpečné a auditovatelné. Od IURIVERSE.",
    type: "website",
    locale: "cs_CZ",
  },
};

// Per-route theme colour (the dark cinematic brand) — does not affect the app,
// whose root layout keeps its own themeColor.
export const viewport: Viewport = {
  themeColor: "#0e1822",
};

export default async function LandingPage() {
  // On landing-only hosts (public domain before launch) the app is not
  // reachable, so the login CTAs must not render — see src/lib/landing-mode.ts.
  const requestHeaders = await headers();
  const showLogin = !isLandingOnlyHost(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );

  return (
    <>
      <MarketingHeader showLogin={showLogin} />
      {/* suppressHydrationWarning: the inline script below adds .js-on before
          hydration; the class gates reveal-hiding so no-JS visitors always see
          the content (see globals.css). */}
      <main id="main" className="landing-root" suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              // Hide reveals only when JS runs — and un-hide again if the
              // client bundle never hydrates (chunk 404, hydration crash):
              // Reveal marks the root .js-live once it mounts.
              'var m=document.currentScript.parentElement;m.classList.add("js-on");setTimeout(function(){if(!m.classList.contains("js-live"))m.classList.remove("js-on")},3000);',
          }}
        />
        <Hero showLogin={showLogin} />
        <ProductPreview />
        <Problem />
        <Solution />
        <FeaturesGrid />
        <Workflow />
        <Trust />
        <Benefits />
        <FinalCta showLogin={showLogin} />
      </main>
      <SiteFooter showLogin={showLogin} />
    </>
  );
}
