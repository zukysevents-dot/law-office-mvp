import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Regression guard for the audit item "after a click it loads forever, after a
// reload it's there". On Next 16.2.9 a route-level loading.tsx boundary made
// every same-URL router refresh (the re-render after a server action's
// revalidatePath, router.refresh()) hang on content-heavy pages until a manual
// reload, and added ~700 ms to every navigation. The boundaries were removed;
// feedback comes from NavigationProgress + pending submit buttons. If a page
// needs streaming, wrap the slow sub-tree in a local <Suspense> instead.
// Details: tests/e2e/README.md, section "Známá omezení".
const LOADING_FILE = /^loading\.(tsx|ts|jsx|js|mdx)$/;

function findLoadingFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findLoadingFiles(full));
    } else if (LOADING_FILE.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

test("src/app neobsahuje žádný route-level loading.tsx (Next 16.2.9 refresh hang)", () => {
  const appDir = path.join(process.cwd(), "src", "app");
  const files = findLoadingFiles(appDir).map((file) =>
    path.relative(process.cwd(), file),
  );
  assert.deepEqual(
    files,
    [],
    `Nalezeny loading boundary soubory: ${files.join(", ")}. ` +
      "Route-level loading.tsx způsobuje na Next 16.2.9 zamrznutí obnovy po server action " +
      "(viz tests/e2e/README.md – Známá omezení). Použijte lokální <Suspense>.",
  );
});
