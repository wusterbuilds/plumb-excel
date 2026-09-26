import type { FileTreeEntry } from "./types";

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${serverUrl}/api/health`, 5_000);
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch {
    return false;
  }
}

export async function fetchTree(
  serverUrl: string,
  rootPath: string,
): Promise<{ folderName: string; tree: FileTreeEntry[] }> {
  const url = `${serverUrl}/api/tree?root=${encodeURIComponent(rootPath)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Server responded with ${res.status}`);
  }
  return res.json();
}

export async function fetchFile(
  serverUrl: string,
  rootPath: string,
  filePath: string,
): Promise<string> {
  const url = `${serverUrl}/api/file?root=${encodeURIComponent(rootPath)}&path=${encodeURIComponent(filePath)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Server responded with ${res.status}`);
  }
  return res.text();
}

export async function fetchFileBuffer(
  serverUrl: string,
  rootPath: string,
  filePath: string,
): Promise<Uint8Array> {
  const url = `${serverUrl}/api/file?root=${encodeURIComponent(rootPath)}&path=${encodeURIComponent(filePath)}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Server responded with ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
