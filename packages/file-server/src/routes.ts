import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { buildTree } from "./tree-builder.js";

const MAX_FILE_BYTES = 100 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function validateRoot(root: string): Promise<string | null> {
  try {
    const resolved = path.resolve(root);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) return null;
    return resolved;
  } catch {
    return null;
  }
}

export function createRouter(): Router {
  const router = Router();

  router.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/api/tree", async (req, res) => {
    const root = req.query.root as string | undefined;
    if (!root) {
      res.status(400).json({ error: "Missing 'root' query parameter" });
      return;
    }

    const resolved = await validateRoot(root);
    if (!resolved) {
      res.status(400).json({ error: `Invalid directory: ${root}` });
      return;
    }

    try {
      const tree = await buildTree(resolved);
      const folderName = path.basename(resolved);
      res.json({ folderName, tree });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to read directory",
      });
    }
  });

  const BINARY_EXTENSIONS = new Set([".xlsx", ".xls", ".ods", ".pdf", ".docx"]);

  router.get("/api/file", async (req, res) => {
    const root = req.query.root as string | undefined;
    const filePath = req.query.path as string | undefined;

    if (!root || !filePath) {
      res
        .status(400)
        .json({ error: "Missing 'root' and/or 'path' query parameters" });
      return;
    }

    const resolvedRoot = await validateRoot(root);
    if (!resolvedRoot) {
      res.status(400).json({ error: `Invalid directory: ${root}` });
      return;
    }

    const fullPath = path.resolve(resolvedRoot, filePath);
    if (
      !fullPath.startsWith(resolvedRoot + path.sep) &&
      fullPath !== resolvedRoot
    ) {
      res.status(403).json({ error: "Path traversal denied" });
      return;
    }

    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        res.status(400).json({ error: "Not a file" });
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        const buf = await fs.readFile(fullPath);
        res.type("application/octet-stream").send(buf);
        return;
      }

      let content: string;
      if (stat.size > MAX_FILE_BYTES) {
        const buf = Buffer.alloc(MAX_FILE_BYTES);
        const fd = await fs.open(fullPath, "r");
        try {
          await fd.read(buf, 0, MAX_FILE_BYTES, 0);
        } finally {
          await fd.close();
        }
        content = `${buf.toString("utf-8")}\n\n[Truncated: file is ${formatBytes(stat.size)}, showing first ${formatBytes(MAX_FILE_BYTES)}]`;
      } else {
        content = await fs.readFile(fullPath, "utf-8");
      }

      res.type("text/plain").send(content);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to read file",
      });
    }
  });

  return router;
}
