import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  IGNORED_DIR_NAMES,
  IGNORED_PATH_FRAGMENTS,
  REPO_ROOT,
} from "./paths";

export interface SourceFile {
  // Absolute path on disk.
  absPath: string;
  // Path relative to the repo root, always forward-slashed (for stable reports).
  relPath: string;
  text: string;
}

function isIgnored(absPath: string): boolean {
  const rel = path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
  if (IGNORED_PATH_FRAGMENTS.some((frag) => absPath.includes(frag))) {
    return true;
  }
  return rel.split("/").some((segment) => IGNORED_DIR_NAMES.has(segment));
}

function walkDir(dir: string, exts: string[], out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) {
        continue;
      }
      walkDir(abs, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      if (!isIgnored(abs)) {
        out.push(abs);
      }
    }
  }
}

// Reads source files under the given roots with one of the given extensions.
export function collectSources(
  roots: string[],
  exts: string[],
): SourceFile[] {
  const files: string[] = [];
  for (const root of roots) {
    walkDir(path.join(REPO_ROOT, root), exts, files);
  }
  return files.map((absPath) => ({
    absPath,
    relPath: path.relative(REPO_ROOT, absPath).split(path.sep).join("/"),
    text: fs.readFileSync(absPath, "utf8"),
  }));
}

// Files tracked by git (for the secrets gate, which must scan exactly what is
// committed — not the gitignored local .env files).
export function gitTrackedFiles(): string[] {
  const res = spawnSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    return [];
  }
  return res.stdout.split("\0").filter((line) => line.length > 0);
}

// 1-based line number for a character offset within a text.
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

export function readIfText(absPath: string): string | null {
  try {
    const buf = fs.readFileSync(absPath);
    // Heuristic binary check: a NUL byte in the first 8KB ⇒ skip.
    const probe = buf.subarray(0, 8192);
    if (probe.includes(0)) {
      return null;
    }
    return buf.toString("utf8");
  } catch {
    return null;
  }
}
