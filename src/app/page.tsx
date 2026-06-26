import type { Metadata, Viewport } from "next";

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
    "Evidence subjektů, kontrola střetu zájmů, lhůty, výkazy práce a fakturace v jednom bezpečném a auditovatelném systému. Celá advokátní kancelář na jedné oběžné dráze.",
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

export default function LandingPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main" className="landing-root">
        <Hero />
        <ProductPreview />
        <Problem />
        <Solution />
        <FeaturesGrid />
        <Workflow />
        <Trust />
        <Benefits />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
