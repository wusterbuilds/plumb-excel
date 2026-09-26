import { FolderOpen, Loader2, RefreshCw, Server } from "lucide-react";
import { FileTree } from "./file-tree";
import { useLocalFiles } from "./local-files-context";

export function FilesTab() {
  const { state, refreshTree } = useLocalFiles();

  if (!state.folderName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        <Server size={24} className="text-(--chat-text-muted)" />
        <div className="text-center space-y-2">
          <p className="text-xs text-(--chat-text-muted) leading-relaxed">
            Connect to the companion file server to browse local files and use
            them as @mention context in chat.
          </p>
          <p className="text-[10px] text-(--chat-text-muted) leading-relaxed">
            1. Run{" "}
            <code
              className="px-1 py-0.5 bg-(--chat-input-bg) border border-(--chat-border) text-(--chat-accent)"
              style={{ borderRadius: "3px" }}
            >
              pnpm file-server
            </code>{" "}
            in a terminal
            <br />
            2. Go to <strong>Settings &gt; Local Files</strong> to configure
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ fontFamily: "var(--chat-font)" }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--chat-border) bg-(--chat-bg-secondary)">
        <div className="flex items-center gap-1.5 text-xs text-(--chat-text-secondary) min-w-0">
          <FolderOpen size={12} className="shrink-0 text-(--chat-accent)" />
          <span className="truncate">{state.folderName}</span>
        </div>
        <button
          type="button"
          onClick={refreshTree}
          disabled={state.loading}
          className="p-1 text-(--chat-text-muted) hover:text-(--chat-text-primary)
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh file tree"
        >
          <RefreshCw
            size={12}
            className={state.loading ? "animate-spin" : ""}
          />
        </button>
      </div>

      {state.error && (
        <div className="px-3 py-2 text-xs text-(--chat-error) bg-(--chat-bg)">
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            size={20}
            className="animate-spin text-(--chat-text-muted)"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <FileTree tree={state.tree} />
        </div>
      )}
    </div>
  );
}
