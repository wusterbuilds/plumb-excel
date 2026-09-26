import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Image,
} from "lucide-react";
import { useState } from "react";
import type { FileTreeEntry, FolderEntry } from "./types";

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls", "csv", "ods"].includes(ext))
    return <FileSpreadsheet size={14} className="text-(--chat-accent)" />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return <Image size={14} className="text-(--chat-text-muted)" />;
  if (["md", "txt", "pdf", "doc", "docx"].includes(ext))
    return <FileText size={14} className="text-(--chat-text-muted)" />;
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "rs",
      "go",
      "java",
      "c",
      "cpp",
      "h",
      "css",
      "html",
      "json",
      "yaml",
      "yml",
      "toml",
      "sh",
      "sql",
    ].includes(ext)
  )
    return <FileCode size={14} className="text-(--chat-text-muted)" />;
  return <File size={14} className="text-(--chat-text-muted)" />;
}

function TreeNode({ entry, depth }: { entry: FileTreeEntry; depth: number }) {
  const [expanded, setExpanded] = useState(false);

  const indent = depth * 12 + 4;

  if (entry.kind === "directory") {
    const folder = entry as FolderEntry;
    return (
      <div>
        <button
          type="button"
          onPointerUp={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-1 px-1 py-[3px] text-xs text-(--chat-text-primary)
                     hover:bg-(--chat-bg-secondary) active:bg-(--chat-bg-secondary) transition-colors text-left cursor-pointer select-none"
          style={{ paddingLeft: `${indent}px` }}
        >
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            {expanded ? (
              <ChevronDown size={12} className="text-(--chat-text-muted)" />
            ) : (
              <ChevronRight size={12} className="text-(--chat-text-muted)" />
            )}
          </span>
          {expanded ? (
            <FolderOpen size={14} className="shrink-0 text-(--chat-accent)" />
          ) : (
            <Folder size={14} className="shrink-0 text-(--chat-accent)" />
          )}
          <span className="truncate ml-0.5">{entry.name}</span>
        </button>
        {expanded && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 w-px bg-(--chat-border) opacity-40"
              style={{ left: `${indent + 8}px` }}
            />
            {folder.children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-1 py-[3px] text-xs text-(--chat-text-secondary)
                 hover:bg-(--chat-bg-secondary) transition-colors cursor-default select-none"
      style={{ paddingLeft: `${indent + 16}px` }}
      title={entry.path}
    >
      {getFileIcon(entry.name)}
      <span className="truncate ml-0.5">{entry.name}</span>
    </div>
  );
}

export function FileTree({ tree }: { tree: FileTreeEntry[] }) {
  if (tree.length === 0) {
    return (
      <p className="text-xs text-(--chat-text-muted) px-3 py-2">
        Folder is empty
      </p>
    );
  }

  return (
    <div className="overflow-y-auto py-1">
      {tree.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={0} />
      ))}
    </div>
  );
}
