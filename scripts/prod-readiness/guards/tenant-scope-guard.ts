import { Finding } from "../lib/findings";
import { collectSources, lineAt } from "../lib/walk";
import { extractBalancedParens } from "./util";

// Multi-row / mutate-by-filter Prisma calls that MUST carry a tenant scope.
// findUnique-by-id is excluded (single record; org is verified post-fetch).
const CALL_RE = /\b(\w+)\.(\w+)\.(findMany|findFirst|updateMany|deleteMany)\s*\(/g;

// Models that are NOT tenant business data and have legitimate non-org access
// patterns (authentication, the tenancy join table itself, platform catalog,
// token/session ops). The generic rule skips these; `user` is handled by its
// own dedicated rule below.
const INFRA_MODELS = new Set([
  "organization",
  "organizationmember",
  "organizationjoincode",
  "module",
  "subscription",
  "account",
  "session",
  "verificationtoken",
  "portalsession",
  "portallogintoken",
]);

// Inline-argument markers that prove a tenant/visibility scope.
const SCOPE_IN_ARGS = ["VisibilityWhere(", "organizationId", "andWhere(", "memberships"];
// A specific entity-id anchor (id:, subjectId:, caseId:, userId:, portalAccessId:,
// …) means the query targets a record set already authorized via its parent.
const ID_ANCHOR_RE = /\b(?:id|[A-Za-z]+Id)\s*:/;
// Org assertions that often appear just AFTER a post-fetch.
const SCOPE_AFTER = ["assertSameOrg(", "assertCanEditRecord(", "orgMismatch("];
// Markers proving scope, used both inline and inside a resolved `where` variable.
const SCOPE_MARKERS = ["VisibilityWhere(", "organizationId", "andWhere(", "memberships"];
// User markers: a user listing must be filtered to the caller's org/members.
const USER_SCOPE = ["organizationId", "memberships", "OrganizationMember"];

// Many pages build `const where = andWhere(visibilityWhere(user), …)` and then
// call `prisma.x.findMany({ where, … })`. When the call passes a `where`
// variable (shorthand or `where: where`), resolve it to its nearest assignment
// and check THAT for scope markers — more precise than a fixed look-back window.
function whereVarScoped(text: string, callIndex: number, args: string, markers: string[]): boolean {
  const usesWhereVar = /\bwhere\s*[,}]/.test(args) || /where\s*:\s*where\b/.test(args);
  if (!usesWhereVar) {
    return false;
  }
  const before = text.slice(0, callIndex);
  const assignIdx = before.lastIndexOf("where =");
  if (assignIdx === -1 || callIndex - assignIdx > 2500) {
    return false;
  }
  const chunk = text.slice(assignIdx, callIndex);
  return markers.some((marker) => chunk.includes(marker));
}

export interface TenantScopeResult {
  findings: Finding[];
  checked: number;
}

export function runTenantScopeGuard(): TenantScopeResult {
  // Authored app code, but NOT the platform-admin surface (which legitimately
  // queries across all organizations, gated by assertPlatformAdmin).
  const sources = collectSources(["src/app"], [".ts", ".tsx"]).filter(
    (file) => !file.relPath.includes("app/admin/"),
  );
  const findings: Finding[] = [];
  let checked = 0;

  for (const file of sources) {
    const { text } = file;
    let m: RegExpExecArray | null;
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(text)) !== null) {
      const [, receiver, rawModel, method] = m;
      const model = rawModel.toLowerCase();
      checked += 1;

      const openParen = m.index + m[0].length - 1;
      const args = extractBalancedParens(text, openParen);
      const after = text.slice(openParen, openParen + 1000);
      const line = lineAt(text, m.index);

      // --- Dedicated rule: cross-tenant user enumeration -------------------
      if (model === "user") {
        // Only listings leak across tenants; findFirst/findUnique are by
        // email/id (authentication / single lookup).
        if (method !== "findMany") {
          continue;
        }
        const userScoped =
          USER_SCOPE.some((marker) => args.includes(marker)) ||
          whereVarScoped(text, m.index, args, USER_SCOPE);
        if (userScoped) {
          continue;
        }
        findings.push({
          rule: "tenant-scope/cross-tenant-user-listing",
          severity: "HIGH",
          message:
            "`user.findMany(...)` bez org/membership filtru — vypíše uživatele " +
            "napříč VŠEMI firmami (únik identit/jmen napříč tenanty).",
          file: file.relPath,
          line,
          evidence: `${receiver}.${rawModel}.${method}(...)`,
        });
        continue;
      }

      // Infra/auth models: legitimate non-org access patterns.
      if (INFRA_MODELS.has(model)) {
        continue;
      }

      // --- Generic rule: tenant business model needs a scope ---------------
      const scoped =
        SCOPE_IN_ARGS.some((marker) => args.includes(marker)) ||
        ID_ANCHOR_RE.test(args) ||
        whereVarScoped(text, m.index, args, SCOPE_MARKERS) ||
        SCOPE_AFTER.some((marker) => after.includes(marker));
      if (scoped) {
        continue;
      }

      findings.push({
        rule: "tenant-scope/unscoped-query",
        severity: "HIGH",
        message:
          `\`${receiver}.${rawModel}.${method}(...)\` nemá tenant scope ` +
          "(chybí *VisibilityWhere / organizationId / andWhere / id-anchor a žádná org-aserce poblíž).",
        file: file.relPath,
        line,
        evidence: `${receiver}.${rawModel}.${method}(...)`,
      });
    }
  }

  return { findings, checked };
}
