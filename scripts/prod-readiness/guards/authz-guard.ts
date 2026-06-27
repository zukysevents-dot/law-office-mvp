import { Finding } from "../lib/findings";
import { collectSources } from "../lib/walk";
import { splitTopLevelExports } from "./util";

// A function that resolves the caller and then mutates is a privileged endpoint.
const AUTHED_RE = /\b(getCurrentUser|getAuthUser)\s*\(/;
const MUTATION_RE = /\.\w+\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/;

// Any of these in the body counts as an authorization decision (vs. mere login):
// explicit role/record asserts, module entitlement gate, visibility composition,
// or self/own-org scoping of the write.
const AUTHZ_MARKERS = [
  "assertCan",
  "assertSameOrg",
  "assertPlatformAdmin",
  "assertModuleEnabled",
  "assertCanAdminister",
  "canEditRecord",
  "canManage",
  "canView",
  "VisibilityWhere",
  "currentUser.id",
  "currentUser.organizationId",
  "user.id",
];

export interface AuthzResult {
  findings: Finding[];
  checked: number;
}

// Finds server actions (and route handlers) that authenticate the caller and
// mutate data but contain NO authorization check — i.e. "verifies login, not
// permission to act". Targets src/app/actions and src/app/api.
export function runAuthzGuard(): AuthzResult {
  const sources = collectSources(["src/app/actions", "src/app/api"], [".ts"]);
  const findings: Finding[] = [];
  let checked = 0;

  for (const file of sources) {
    for (const fn of splitTopLevelExports(file.text)) {
      const authed = AUTHED_RE.test(fn.body);
      const mutates = MUTATION_RE.test(fn.body);
      if (!authed || !mutates) {
        continue;
      }
      checked += 1;
      const hasAuthz = AUTHZ_MARKERS.some((marker) => fn.body.includes(marker));
      if (hasAuthz) {
        continue;
      }
      findings.push({
        rule: "authz/mutation-without-authorization",
        severity: "HIGH",
        message:
          `\`${fn.name}\` ověřuje přihlášení a mutuje data, ale neobsahuje žádnou ` +
          "autorizační kontrolu (assertCan*/assertSameOrg/assertModuleEnabled/self-scope).",
        file: file.relPath,
        line: fn.line,
        evidence: `export ... ${fn.name}(...) { getCurrentUser(); ...mutate... }`,
      });
    }
  }

  return { findings, checked };
}
