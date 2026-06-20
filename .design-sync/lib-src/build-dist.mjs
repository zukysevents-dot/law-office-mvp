// Bundles the design-system entry into dist/ds.es.js for the design-sync converter.
// Run from repo root: node .design-sync/lib-src/build-dist.mjs
import { build } from "../../.ds-sync/node_modules/esbuild/lib/main.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

await build({
  entryPoints: [resolve(here, "index.tsx")],
  outfile: resolve(repo, "dist/ds.es.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  platform: "browser",
  target: "es2020",
  // React + lucide come from the converter's _vendor bundle / are passed as props.
  external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"],
  alias: {
    "@": resolve(repo, "src"),
    "next/link": resolve(here, "next-link-shim.tsx"),
  },
  logLevel: "info",
});

console.log("built dist/ds.es.js");
