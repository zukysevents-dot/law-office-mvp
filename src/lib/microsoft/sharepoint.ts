/**
 * Deterministic SharePoint folder URLs from a naming convention — no API call.
 *
 * The same path segments feed both the plain URL builder (`buildSharepointFolderUrl`)
 * and the optional Graph folder creation (`ensureFolderPath` in `graph-client.ts`).
 */

import { getSharepointConfig } from "@/lib/microsoft/config";

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
 * Full clickable SharePoint URL for the folder. Returns null when the SharePoint
 * site is not configured (`SHAREPOINT_SITE_URL` missing).
 */
export function buildSharepointFolderUrl(segments: string[]): string | null {
  const config = getSharepointConfig();
  if (!config) {
    return null;
  }

  // The library may be a multi-segment path (e.g. "Shared Documents/Spisy"); encode each part.
  const libraryParts = config.library.split("/").map((part) => part.trim()).filter(Boolean);
  const path = [...libraryParts, ...segments].map(encodeURIComponent).join("/");
  return `${config.siteUrl}/${path}`;
}
