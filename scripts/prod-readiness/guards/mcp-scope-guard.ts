import { Finding } from "../lib/findings";
import { collectSources, lineAt } from "../lib/walk";

// Registration shapes for an app-hosted MCP tool. If/when this repo grows an MCP
// server, every tool handler must apply a tenant/role scope (the same crown-jewel
// rule as Prisma queries). Today there are zero registrations — the guard reports
// N/A rather than a meaningful green.
const REGISTRATION_RE =
  /\.(?:tool|registerTool)\s*\(|new\s+McpServer\s*\(|setRequestHandler\s*\(\s*CallToolRequestSchema/g;

const SCOPE_MARKERS = [
  "organizationId",
  "VisibilityWhere",
  "assertSameOrg",
  "getCurrentUser",
  "assertCan",
];

export interface McpScopeResult {
  findings: Finding[];
  registrations: number;
}

export function runMcpScopeGuard(): McpScopeResult {
  const sources = collectSources(["src"], [".ts", ".tsx"]);
  const findings: Finding[] = [];
  let registrations = 0;

  for (const file of sources) {
    const { text } = file;
    let m: RegExpExecArray | null;
    REGISTRATION_RE.lastIndex = 0;
    while ((m = REGISTRATION_RE.exec(text)) !== null) {
      registrations += 1;
      // Look at the handler window following the registration for a scope marker.
      const window = text.slice(m.index, m.index + 1500);
      const scoped = SCOPE_MARKERS.some((marker) => window.includes(marker));
      if (!scoped) {
        findings.push({
          rule: "mcp/tool-without-scope",
          severity: "HIGH",
          message:
            "MCP tool registrován bez zjevného tenant/role scope " +
            "(chybí organizationId / *VisibilityWhere / assertSameOrg / getCurrentUser v handleru).",
          file: file.relPath,
          line: lineAt(text, m.index),
          evidence: m[0],
        });
      }
    }
  }

  return { findings, registrations };
}
