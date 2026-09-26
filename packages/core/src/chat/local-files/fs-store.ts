import type { FileTreeEntry, FolderEntry } from "./types";

const DB_NAME = "office-agents-local-files";
const DB_VERSION = 2;
const HANDLE_STORE = "handles";
const FILES_STORE = "file-contents";
const META_STORE = "metadata";
const HANDLE_KEY = "master-folder";
const META_KEY = "folder-meta";

const MAX_FILE_BYTES = 100 * 1024;

export function hasNativeFSAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

interface FolderMeta {
  folderName: string;
  tree: FileTreeEntry[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Native FS Access API helpers (Chromium only) ---

export async function persistHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function queryPermission(
  handle: FileSystemDirectoryHandle,
): Promise<"granted" | "prompt" | "denied"> {
  try {
    const status = await handle.queryPermission({ mode: "read" });
    return status as "granted" | "prompt" | "denied";
  } catch {
    return "denied";
  }
}

export async function requestPermission(
  handle: FileSystemDirectoryHandle,
): Promise<"granted" | "prompt" | "denied"> {
  try {
    const status = await handle.requestPermission({ mode: "read" });
    return status as "granted" | "prompt" | "denied";
  } catch {
    return "denied";
  }
}

export async function pickNativeDirectory(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ mode: "read" });
}

export async function buildNativeTree(
  dir: FileSystemDirectoryHandle,
  basePath = "",
): Promise<FileTreeEntry[]> {
  const entries: FileTreeEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) continue;
    const entryPath = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === "directory") {
      const children = await buildNativeTree(
        handle as FileSystemDirectoryHandle,
        entryPath,
      );
      entries.push({ name, path: entryPath, kind: "directory", children });
    } else {
      entries.push({ name, path: entryPath, kind: "file" });
    }
  }
  return sortEntries(entries);
}

export async function readNativeFile(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<string> {
  const parts = filePath.split("/");
  const fileName = parts.pop()!;
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  const fileHandle = await current.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return readWithTruncation(file);
}

export async function readNativeFileBuffer(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<Uint8Array> {
  const parts = filePath.split("/");
  const fileName = parts.pop()!;
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  const fileHandle = await current.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

// --- Fallback: <input webkitdirectory> + IndexedDB cache ---

export async function saveFolderMeta(meta: FolderMeta): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put(meta, META_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFolderMeta(): Promise<FolderMeta | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(META_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFileContent(
  path: string,
  content: string,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite");
    tx.objectStore(FILES_STORE).put(content, path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFileContent(path: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly");
    const req = tx.objectStore(FILES_STORE).get(path);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [HANDLE_STORE, FILES_STORE, META_STORE],
      "readwrite",
    );
    tx.objectStore(HANDLE_STORE).clear();
    tx.objectStore(FILES_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function isTextFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const textExts = [
    "txt",
    "md",
    "csv",
    "json",
    "xml",
    "html",
    "css",
    "js",
    "ts",
    "tsx",
    "jsx",
    "py",
    "sh",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "log",
    "sql",
    "r",
    "rmd",
    "tex",
    "bib",
    "svg",
    "env",
    "gitignore",
    "dockerfile",
    "makefile",
  ];
  return textExts.includes(ext) || !ext;
}

export async function importFolderFromFiles(
  files: File[],
): Promise<{ folderName: string; tree: FileTreeEntry[] }> {
  if (files.length === 0) throw new Error("No files selected");

  const hasRelativePaths = files[0].webkitRelativePath.length > 0;

  let folderName: string;
  if (hasRelativePaths) {
    folderName = files[0].webkitRelativePath.split("/")[0] || "Selected folder";
  } else {
    folderName = "Selected files";
  }

  const treeMap = new Map<string, FileTreeEntry>();
  const db = await openDB();

  const tx = db.transaction(FILES_STORE, "readwrite");
  const store = tx.objectStore(FILES_STORE);

  for (const file of files) {
    let path: string;
    if (hasRelativePaths && file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split("/");
      parts.shift();
      path = parts.join("/");
    } else {
      path = file.name;
    }

    const parts = path.split("/");
    if (parts.some((p) => p.startsWith("."))) continue;

    if (isTextFile(file.name) && file.size <= MAX_FILE_BYTES) {
      try {
        const content = await file.text();
        store.put(content, path);
      } catch {
        // skip unreadable files
      }
    } else if (isTextFile(file.name) && file.size > MAX_FILE_BYTES) {
      try {
        const partial = await file.slice(0, MAX_FILE_BYTES).text();
        const truncated = `${partial}\n\n[Truncated: file is ${formatBytes(file.size)}, showing first ${formatBytes(MAX_FILE_BYTES)}]`;
        store.put(truncated, path);
      } catch {
        // skip
      }
    }

    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      if (!treeMap.has(dirPath)) {
        treeMap.set(dirPath, {
          name: parts[i - 1],
          path: dirPath,
          kind: "directory",
          children: [],
        });
      }
    }
    treeMap.set(path, { name: parts[parts.length - 1], path, kind: "file" });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const tree = buildTreeFromPaths(treeMap);
  await saveFolderMeta({ folderName, tree });
  return { folderName, tree };
}

function buildTreeFromPaths(
  entries: Map<string, FileTreeEntry>,
): FileTreeEntry[] {
  const roots: FileTreeEntry[] = [];

  for (const entry of entries.values()) {
    const parentPath = entry.path.includes("/")
      ? entry.path.slice(0, entry.path.lastIndexOf("/"))
      : null;

    if (parentPath && entries.has(parentPath)) {
      const parent = entries.get(parentPath)!;
      if (parent.kind === "directory") {
        (parent as FolderEntry).children.push(entry);
      }
    } else {
      roots.push(entry);
    }
  }

  const sortTree = (items: FileTreeEntry[]): FileTreeEntry[] => {
    for (const item of items) {
      if (item.kind === "directory") {
        (item as FolderEntry).children = sortTree(
          (item as FolderEntry).children,
        );
      }
    }
    return sortEntries(items);
  };

  return sortTree(roots);
}

// --- Shared helpers ---

function sortEntries(entries: FileTreeEntry[]): FileTreeEntry[] {
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function flattenFiles(tree: FileTreeEntry[]): FileTreeEntry[] {
  const result: FileTreeEntry[] = [];
  for (const entry of tree) {
    result.push(entry);
    if (entry.kind === "directory") {
      result.push(...flattenFiles((entry as FolderEntry).children));
    }
  }
  return result;
}

async function readWithTruncation(file: File | Blob): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    const partial = await file.slice(0, MAX_FILE_BYTES).text();
    return `${partial}\n\n[Truncated: file is ${formatBytes(file.size)}, showing first ${formatBytes(MAX_FILE_BYTES)}]`;
  }
  return file.text();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
