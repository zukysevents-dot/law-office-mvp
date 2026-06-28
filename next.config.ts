import type { NextConfig } from "next";

// ponytail: deliberately no Content-Security-Policy here — a wrong CSP silently
// breaks the app; add one once it can be tested end-to-end. These headers are
// the safe, high-value subset.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Heavy, server-only CJS packages: keep them out of the bundle so they load
  // from node_modules at runtime instead of being traced/bundled into route code.
  serverExternalPackages: ["nodemailer", "pg"],
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Rewrite barrel imports to direct deep imports so a single icon / calendar
    // plugin doesn't drag the whole package into the client bundle.
    optimizePackageImports: [
      "lucide-react",
      "@fullcalendar/react",
      "@fullcalendar/core",
      "@fullcalendar/daygrid",
      "@fullcalendar/timegrid",
      "@fullcalendar/list",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
