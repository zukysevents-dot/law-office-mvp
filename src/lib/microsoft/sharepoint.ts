/**
 * Deterministic SharePoint folder URLs from a naming convention — no API call.
 * The path segments feed the URL builder (`buildSharepointFolderUrl`).
 */

import { getSharepointUrlConfig } from "@/lib/microsoft/config";

export type SharepointEntityType = "Subject" | "Project" | "Case";

export type SharepointEntityInput =
  | { type: "Subject"; record: { id: string; name: string; ico: string | null } }
  | { type: "Project"; record: { id: string; name: string } }
  | {
      type: "Case";
      record: {
        id: string;
        name: string;
        fileNumber: string | null;
        project: { id: string; name: string };
      };
    };

/** Last 6 chars of a cuid — short, stable, collision-safe enough for folder names. */
function shortId(id: string): string {
  return id.slice(-6);
}

/** Strip characters SharePoint/OneDrive disallow in file or folder names. */
export function sanitizeSegment(value: string): string {
  return value
    .replace(/["*:<>?/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Give every uploaded binary a unique suffix. Graph's simple PUT upload
 * replaces an existing file with the same name; this keeps LawOffice versions
 * independently addressable even when SharePoint versioning is disabled.
 */
export function uniqueSharepointFilename(name: string, token: string): string {
  const safeName = sanitizeSegment(name) || "Dokument";
  const safeToken = sanitizeSegment(token) || "verze";
  const dot = safeName.lastIndexOf(".");
  if (dot <= 0 || dot === safeName.length - 1) {
    return `${safeName} (${safeToken})`;
  }
  return `${safeName.slice(0, dot)} (${safeToken})${safeName.slice(dot)}`;
}

function labeled(name: string, suffix: string | null): string {
  const cleanName = sanitizeSegment(name) || "Bez názvu";
  const cleanSuffix = suffix ? sanitizeSegment(suffix) : "";
  return cleanSuffix ? `${cleanName} (${cleanSuffix})` : cleanName;
}

/** Path segments (already sanitized) for an entity's folder, relative to the library root. */
export function sharepointFolderSegments(input: SharepointEntityInput): string[] {
  switch (input.type) {
    case "Subject":
      return ["Subjekty", labeled(input.record.name, input.record.ico ?? shortId(input.record.id))];
    case "Project":
      return ["Projekty", labeled(input.record.name, shortId(input.record.id))];
    case "Case":
      return [
        "Projekty",
        labeled(input.record.project.name, shortId(input.record.project.id)),
        "Případy",
        labeled(input.record.name, input.record.fileNumber ?? shortId(input.record.id)),
      ];
  }
}

/**
 * Full clickable SharePoint URL for the folder. Returns null when the org has no
 * SharePoint site configured (ani v /settings/sharepoint, ani v env).
 */
export async function buildSharepointFolderUrl(
  organizationId: string | null | undefined,
  segments: string[],
): Promise<string | null> {
  const config = await getSharepointUrlConfig(organizationId);
  if (!config) {
    return null;
  }

  // The library may be a multi-segment path (e.g. "Shared Documents/Spisy"); encode each part.
  const libraryParts = config.library
    .split("/")
    .map((part: string) => part.trim())
    .filter(Boolean);
  const path = [...libraryParts, ...segments].map(encodeURIComponent).join("/");
  return `${config.siteUrl}/${path}`;
}

// Hlubší zanoření než tohle je v praxi překlep nebo pokus o zahlcení, ne spis.
const MAX_RELATIVE_DEPTH = 10;

/**
 * Rozparsuje relativní cestu z `?path=` na segmenty. Trust boundary: výsledek se
 * lepí za kořen spisu, takže se tu zahazuje všechno, čím by se dalo z kořene
 * uniknout — "..", ".", prázdné segmenty i zpětná lomítka. Escapovat tedy nejde
 * ani zakódovaným vstupem: co projde, jsou vždy jen názvy podsložek.
 */
export function parseRelativePath(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split("/")
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\"),
    )
    .slice(0, MAX_RELATIVE_DEPTH);
}

/** Zpětně poskládá segmenty do hodnoty pro `?path=`. */
export function formatRelativePath(segments: string[]): string {
  return segments.join("/");
}
