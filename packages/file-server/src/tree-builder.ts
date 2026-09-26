import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface FileEntry {
  name: string;
  path: string;
  kind: "file";
}

export interface FolderEntry {
  name: string;
  path: string;
  kind: "directory";
  children: FileTreeEntry[];
}

export type FileTreeEntry = FileEntry | FolderEntry;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".vscode",
  ".idea",
  "__pycache__",
  ".cache",
  "dist",
  "build",
  ".DS_Store",
]);

const MAX_DEPTH = 10;

function sortEntries(entries: FileTreeEntry[]): FileTreeEntry[] {
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export async function buildTree(
  rootDir: string,
  relativePath = "",
  depth = 0,
): Promise<FileTreeEntry[]> {
  if (depth > MAX_DEPTH) return [];

  const absPath = path.join(rootDir, relativePath);
  let dirents: Dirent[];

  try {
    dirents = await fs.readdir(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries: FileTreeEntry[] = [];

  for (const dirent of dirents) {
    if (dirent.name.startsWith(".") || IGNORED_DIRS.has(dirent.name)) continue;

    const entryRelPath = relativePath
      ? `${relativePath}/${dirent.name}`
      : dirent.name;

    if (dirent.isDirectory()) {
      const children = await buildTree(rootDir, entryRelPath, depth + 1);
      entries.push({
        name: dirent.name,
        path: entryRelPath,
        kind: "directory",
        children,
      });
    } else if (dirent.isFile()) {
      entries.push({
        name: dirent.name,
        path: entryRelPath,
        kind: "file",
      });
    }
  }

  return sortEntries(entries);
}
