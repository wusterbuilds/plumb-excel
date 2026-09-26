import { CHAT_MODES, type ChatMode } from "@office-agents/sdk";
import {
  AtSign,
  Bot,
  ChevronDown,
  FileText,
  MessageCircleQuestion,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "./chat-context";
import { useLocalFiles } from "./local-files/local-files-context";
import { MentionPopup } from "./local-files/mention-popup";
import type { MentionItem } from "./local-files/types";

const MODE_ICONS: Record<ChatMode, typeof Bot> = {
  agent: Bot,
  ask: MessageCircleQuestion,
  plan: FileText,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const LINE_HEIGHT = 20;
const MIN_ROWS = 1;
const MAX_ROWS = 2;

function ModeSelector() {
  const { state, setChatMode } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mode = state.chatMode;
  const Icon = MODE_ICONS[mode];

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1.5 py-0.5 text-[11px]
                   text-(--chat-text-muted) hover:text-(--chat-text-primary)
                   transition-colors"
        style={{ borderRadius: "var(--chat-radius)" }}
        title={`Mode: ${CHAT_MODES.find((m) => m.value === mode)?.label}`}
      >
        <Icon size={12} />
        <span>{CHAT_MODES.find((m) => m.value === mode)?.label}</span>
        <ChevronDown
          size={10}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 w-32 bg-(--chat-bg) border border-(--chat-border) shadow-lg z-50 overflow-hidden"
          style={{
            borderRadius: "var(--chat-radius)",
            fontFamily: "var(--chat-font)",
          }}
        >
          {CHAT_MODES.map((m) => {
            const MIcon = MODE_ICONS[m.value];
            const active = m.value === mode;
            return (
              <button
                type="button"
                key={m.value}
                onClick={() => {
                  setChatMode(m.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-(--chat-bg-secondary) text-(--chat-accent)"
                    : "text-(--chat-text-secondary) hover:bg-(--chat-bg-secondary)"
                }`}
              >
                <MIcon size={12} />
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChatInput() {
  const { sendMessage, state, abort, processFiles, removeUpload, adapter } =
    useChat();
  const { getFileMentionItems, state: localFilesState } = useLocalFiles();
  const [input, setInput] = useState("");
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionStartRef = useRef<number>(-1);
  const uploads = state.uploads;
  const isUploading = state.isUploading;

  const allMentionItems = useMemo(() => {
    const fileItems = localFilesState.folderName ? getFileMentionItems() : [];
    return fileItems;
  }, [localFilesState.folderName, getFileMentionItems]);

  const [adapterMentionItems, setAdapterMentionItems] = useState<MentionItem[]>(
    [],
  );

  useEffect(() => {
    if (!adapter.getMentionableItems) {
      setAdapterMentionItems([]);
      return undefined;
    }
    let cancelled = false;
    adapter.getMentionableItems().then((items) => {
      if (!cancelled) setAdapterMentionItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const combinedMentionItems = useMemo(
    () => [...adapterMentionItems, ...allMentionItems],
    [adapterMentionItems, allMentionItems],
  );

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const min = LINE_HEIGHT * MIN_ROWS;
    const max = LINE_HEIGHT * MAX_ROWS;
    const clamped = Math.max(min, Math.min(ta.scrollHeight, max));
    ta.style.height = `${clamped}px`;
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (!input) {
      autoResize();
    }
  }, [input, autoResize]);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setInput(value);
      autoResize();

      const textBeforeCursor = value.slice(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

      if (atMatch) {
        mentionStartRef.current = cursorPos - atMatch[0].length;
        setMentionQuery(atMatch[1]);
        setMentionActive(true);
      } else {
        setMentionActive(false);
        setMentionQuery("");
      }
    },
    [autoResize],
  );

  const handleMentionSelect = useCallback(
    (item: MentionItem) => {
      const start = mentionStartRef.current;
      if (start < 0) return;

      const before = input.slice(0, start);
      const cursorPos = textareaRef.current?.selectionStart ?? input.length;
      const after = input.slice(cursorPos);
      const newInput = `${before}@${item.label} ${after}`;

      setInput(newInput);
      setMentionActive(false);
      setMentionQuery("");

      if (!mentions.find((m) => m.id === item.id)) {
        setMentions((prev) => [...prev, item]);
      }

      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          const newPos = before.length + item.label.length + 2;
          ta.selectionStart = newPos;
          ta.selectionEnd = newPos;
          ta.focus();
        }
      });
    },
    [input, mentions],
  );

  const removeMention = useCallback((id: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    const BINARY_EXTS = new Set([
      "pdf",
      "docx",
      "xlsx",
      "xls",
      "ods",
      "pptx",
      "doc",
    ]);

    const trimmed = input.trim();
    if (!trimmed) return;
    const attachmentNames = uploads.map((u) => u.name);

    const binaryAttachmentNames: string[] = [];
    let mentionedFiles: { name: string; content: string }[] | undefined;

    if (mentions.length > 0) {
      const textFiles: { name: string; content: string }[] = [];
      for (const m of mentions) {
        const ext = m.label.split(".").pop()?.toLowerCase() ?? "";
        if (BINARY_EXTS.has(ext) && m.resolveBuffer) {
          try {
            const data = await m.resolveBuffer();
            await processFiles([new File([data as BlobPart], m.label)]);
            binaryAttachmentNames.push(m.label);
          } catch {
            textFiles.push({
              name: m.label,
              content: "[Error: could not read file]",
            });
          }
        } else {
          try {
            const content = await m.resolveContent();
            textFiles.push({ name: m.label, content });
          } catch {
            textFiles.push({
              name: m.label,
              content: "[Error: could not read file]",
            });
          }
        }
      }
      if (textFiles.length > 0) mentionedFiles = textFiles;
    }

    const allAttachments = [...attachmentNames, ...binaryAttachmentNames];

    setInput("");
    setMentions([]);
    await sendMessage(
      trimmed,
      allAttachments.length > 0 ? allAttachments : undefined,
      mentionedFiles,
    );
  }, [input, sendMessage, uploads, mentions, processFiles]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionActive) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, mentionActive],
  );

  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      await processFiles(Array.from(files));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processFiles],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className="border-t border-(--chat-border) px-3 py-2 bg-(--chat-bg)"
      style={{ fontFamily: "var(--chat-font)" }}
    >
      {state.error && (
        <div className="text-(--chat-error) text-xs mb-2 px-1">
          {state.error}
        </div>
      )}

      {/* Uploaded files + mention chips */}
      {(uploads.length > 0 || mentions.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {mentions.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-(--chat-accent)/10 border border-(--chat-accent)/30 text-(--chat-accent)"
              style={{ borderRadius: "var(--chat-radius)" }}
            >
              <AtSign size={9} />
              <span className="max-w-[120px] truncate" title={m.label}>
                {m.label}
              </span>
              <button
                type="button"
                onClick={() => removeMention(m.id)}
                className="ml-0.5 text-(--chat-accent)/60 hover:text-(--chat-error) transition-colors"
                title="Remove mention"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {uploads.map((file) => (
            <div
              key={file.name}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-(--chat-bg-secondary) border border-(--chat-border) text-(--chat-text-secondary)"
              style={{ borderRadius: "var(--chat-radius)" }}
            >
              <span className="max-w-[120px] truncate" title={file.name}>
                {file.name}
              </span>
              {file.size > 0 && (
                <span className="text-(--chat-text-muted)">
                  {formatFileSize(file.size)}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeUpload(file.name)}
                className="ml-0.5 text-(--chat-text-muted) hover:text-(--chat-error) transition-colors"
                title="Remove from list"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,.txt,.csv,.json,.xml,.md,.html,.css,.js,.ts,.py,.sh,.xlsx,.xls,.pdf,.docx,.doc,.ods"
      />

      {/* Input container — border on wrapper, textarea + action row inside */}
      <div
        className="relative bg-(--chat-input-bg) border border-(--chat-border) focus-within:border-(--chat-border-active) transition-colors"
        style={{ borderRadius: "var(--chat-radius)" }}
      >
        <MentionPopup
          items={combinedMentionItems}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionActive(false)}
          visible={mentionActive}
        />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            state.providerConfig
              ? "Type a message... (@ to mention files)"
              : "Configure API key in settings"
          }
          disabled={!state.providerConfig}
          className={`
            w-full resize-none bg-transparent text-(--chat-text-primary)
            text-sm px-3 pt-2 pb-0 border-none outline-none
            placeholder:text-(--chat-text-muted)
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          style={{
            fontFamily: "var(--chat-font)",
            lineHeight: `${LINE_HEIGHT}px`,
            height: `${LINE_HEIGHT * MIN_ROWS}px`,
          }}
        />

        {/* Action row inside the border */}
        <div className="flex items-center justify-between px-1.5 py-1">
          <div className="flex items-center gap-1">
            <ModeSelector />
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading || state.isStreaming}
              className="flex items-center justify-center w-6 h-5
                         text-(--chat-text-muted) hover:text-(--chat-text-primary)
                         disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors"
              title="Upload files"
            >
              <Paperclip
                size={13}
                className={isUploading ? "animate-pulse" : ""}
              />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {state.isStreaming && (
              <button
                type="button"
                onClick={abort}
                className="flex items-center justify-center w-6 h-5
                           text-(--chat-error) hover:text-(--chat-bg) hover:bg-(--chat-error)
                           transition-colors"
                style={{ borderRadius: "var(--chat-radius)" }}
                title="Stop generation"
              >
                <Square size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!state.providerConfig || !input.trim()}
              className="flex items-center justify-center w-6 h-5
                         text-(--chat-text-muted) hover:text-(--chat-text-primary)
                         disabled:opacity-30 disabled:cursor-not-allowed
                         transition-colors"
              title={state.isStreaming ? "Stop and send" : "Send message"}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
