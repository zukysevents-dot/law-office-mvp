import type { Metadata } from "next";

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
  title: "syndikat.legal — interní právní systém pro advokátní kancelář",
  description:
    "Evidence subjektů, kontrola střetu zájmů, lhůty, výkazy práce a fakturace v jednom bezpečném a auditovatelném systému advokátní kanceláře.",
  openGraph: {
    title: "syndikat.legal — interní právní systém",
    description:
      "Celá advokátní kancelář v jednom systému: subjekty, conflict check, lhůty, výkazy práce a fakturace.",
    type: "website",
    locale: "cs_CZ",
  },
};

export default function LandingPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
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
