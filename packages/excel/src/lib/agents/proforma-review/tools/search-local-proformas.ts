import { Type } from "@sinclair/typebox";
import * as XLSX from "xlsx";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

interface FileTreeEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeEntry[];
}

const SERVER_URL_KEY = "office-agents-file-server-url";
const ROOT_PATH_KEY = "office-agents-file-server-root";

const BINARY_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);

function getServerConfig(): { serverUrl: string; rootPath: string } {
  return {
    serverUrl: localStorage.getItem(SERVER_URL_KEY) || "https://localhost:3456",
    rootPath: localStorage.getItem(ROOT_PATH_KEY) || "",
  };
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkServerHealth(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${serverUrl}/api/health`, 5_000);
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch {
    return false;
  }
}

async function fetchTree(
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

function xlsxToText(buffer: ArrayBuffer): string {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.trim()) parts.push(csv);
  }
  return parts.join("\n");
}

async function fetchFileAsText(
  serverUrl: string,
  rootPath: string,
  filePath: string,
): Promise<string> {
  const url = `${serverUrl}/api/file?root=${encodeURIComponent(rootPath)}&path=${encodeURIComponent(filePath)}`;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Server responded with ${res.status}`);
  }
  if (BINARY_EXTENSIONS.has(ext)) {
    const buffer = await res.arrayBuffer();
    return xlsxToText(buffer);
  }
  return res.text();
}

function flattenFiles(
  entries: FileTreeEntry[],
  extensions: string[],
): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = [];
  for (const entry of entries) {
    if (entry.kind === "file") {
      const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
      if (extensions.includes(ext)) {
        result.push({ name: entry.name, path: entry.path });
      }
    } else if (entry.kind === "directory") {
      result.push(...flattenFiles(entry.children, extensions));
    }
  }
  return result;
}

export const searchLocalProformasTool = defineTool({
  name: "search_local_proformas",
  label: "Search Local Pro Formas",
  description:
    "Search the connected local folder for past pro forma files and extract relevant metrics. " +
    "Scans .xlsx, .csv, and .pdf files for data matching the target metric. " +
    "Returns historical comparisons from internal files. " +
    "Requires a local folder to be connected via Settings > Local Files.",
  parameters: Type.Object({
    query: Type.String({
      description:
        "Natural language description of what to search for (e.g., 'vacancy rates for multifamily properties')",
    }),
    targetMetric: Type.String({
      description:
        "The specific metric to look for (e.g., 'vacancy rate', 'cap rate', 'rent growth')",
    }),
    fileTypes: Type.Optional(
      Type.Array(Type.String(), {
        description:
          'File extensions to scan. Default: ["xlsx", "csv"]. Can include "txt", "pdf".',
      }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation of the search (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const { serverUrl, rootPath } = getServerConfig();
    if (!rootPath) {
      return toolError(
        "No local folder connected. Ask the user to connect a folder via Settings > Local Files, " +
          "or start the file server with `pnpm file-server` and configure the server URL and root path.",
      );
    }

    try {
      const healthy = await checkServerHealth(serverUrl);
      if (!healthy) {
        return toolError(
          `File server at ${serverUrl} is not responding. ` +
            "Make sure it is running (`pnpm file-server`).",
        );
      }

      const extensions = params.fileTypes ?? ["xlsx", "csv"];
      const { tree } = await fetchTree(serverUrl, rootPath);
      const files = flattenFiles(tree, extensions);

      if (files.length === 0) {
        return toolSuccess({
          files: [],
          message: `No ${extensions.join("/")} files found in the connected folder.`,
          source: "local_history",
        });
      }

      const metricLower = params.targetMetric.toLowerCase();
      const queryLower = params.query.toLowerCase();
      const matches: {
        path: string;
        relevance: string;
        excerpt: string;
        comparisonValue: string | null;
        sourceRef: {
          type: "local_file";
          path: string;
          section?: string;
          displayName: string;
        };
      }[] = [];

      const filesToScan = files.slice(0, 20);

      for (const file of filesToScan) {
        try {
          const content = await fetchFileAsText(serverUrl, rootPath, file.path);
          const lines = content.split("\n");
          const matchingLines: { lineNum: number; text: string }[] = [];

          for (let i = 0; i < lines.length; i++) {
            const lower = lines[i].toLowerCase();
            if (lower.includes(metricLower) || lower.includes(queryLower)) {
              matchingLines.push({ lineNum: i + 1, text: lines[i].trim() });
            }
          }

          if (matchingLines.length > 0) {
            const firstMatch = matchingLines[0];
            const numberMatch = firstMatch.text.match(/[\d,.]+%?|\$[\d,.]+/);

            const sectionStart = Math.max(1, firstMatch.lineNum - 2);
            const sectionEnd = Math.min(lines.length, firstMatch.lineNum + 2);

            matches.push({
              path: file.path,
              relevance:
                matchingLines.length > 3
                  ? "high"
                  : matchingLines.length > 1
                    ? "medium"
                    : "low",
              excerpt: matchingLines
                .slice(0, 3)
                .map((l) => l.text)
                .join(" | "),
              comparisonValue: numberMatch ? numberMatch[0] : null,
              sourceRef: {
                type: "local_file",
                path: file.path,
                section: `Rows ${sectionStart}-${sectionEnd}`,
                displayName: file.name,
              },
            });
          }
        } catch {
          // Skip files that can't be read or parsed
        }
      }

      return toolSuccess({
        filesScanned: filesToScan.length,
        totalFilesAvailable: files.length,
        files: matches,
        source: "local_history",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error searching local files";
      return toolError(message);
    }
  },
});
