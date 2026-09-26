import type {
  ChatMessage,
  ChoiceData,
  MessagePart,
  PlanData,
  PlanStep,
} from "@office-agents/sdk";
import { generateId } from "@office-agents/sdk";
import { code } from "@streamdown/code";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  Plus,
  Send,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import type { AnchorHTMLAttributes, ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { useChat } from "./chat-context";
import { useLocalFiles } from "./local-files/local-files-context";
import { MentionPopup } from "./local-files/mention-popup";
import type { MentionItem } from "./local-files/types";

function ThinkingBlock({
  thinking,
  isStreaming,
}: {
  thinking: string;
  isStreaming?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-2 border border-(--chat-border) bg-(--chat-bg) rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-(--chat-accent) hover:bg-(--chat-bg-secondary) transition-colors"
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Brain size={10} />
        thinking
        {isStreaming && <span className="animate-pulse ml-1">...</span>}
      </button>
      {isExpanded && (
        <div className="px-2 py-1.5 text-xs text-(--chat-text-muted) whitespace-pre-wrap wrap-break-word border-t border-(--chat-border) max-h-20 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

type ToolCallPart = Extract<MessagePart, { type: "toolCall" }>;

const CODE_FIELD_LANGS: Record<string, string> = {
  code: "javascript",
  command: "text",
};

const HIDDEN_ARG_FIELDS = new Set(["explanation"]);
const HIDDEN_RESULT_FIELDS = new Set([
  "_dirtyRanges",
  "_modifiedSlide",
  "_hasSnapshot",
]);

function splitArgs(args: Record<string, unknown>) {
  const codeBlocks: { field: string; lang: string; value: string }[] = [];
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (HIDDEN_ARG_FIELDS.has(key)) continue;
    const lang = CODE_FIELD_LANGS[key];
    if (lang && typeof value === "string") {
      codeBlocks.push({ field: key, lang, value });
    } else {
      rest[key] = value;
    }
  }

  return { codeBlocks, rest };
}

function cleanResult(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const cleaned = { ...parsed };
      for (const key of HIDDEN_RESULT_FIELDS) {
        if (key in cleaned) {
          delete cleaned[key];
        }
      }
      return JSON.stringify(cleaned, null, 2);
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    // not JSON, return as-is
  }
  return raw;
}

function ToolCallBlock({ part }: { part: ToolCallPart }) {
  const { adapter, state } = useChat();
  const expandByDefault = state.providerConfig?.expandToolCalls ?? false;
  const [isExpanded, setIsExpanded] = useState(expandByDefault);
  const explanation = (part.args as { explanation?: string })?.explanation;

  const ToolExtras = adapter.ToolExtras;

  const { codeBlocks, rest } = splitArgs(part.args);
  const hasRestArgs = Object.keys(rest).length > 0;

  const statusIcon = {
    pending: (
      <Loader2 size={10} className="animate-spin text-(--chat-text-muted)" />
    ),
    running: (
      <Loader2 size={10} className="animate-spin text-(--chat-accent)" />
    ),
    complete: <CheckCircle2 size={10} className="text-green-500" />,
    error: <XCircle size={10} className="text-red-500" />,
  }[part.status];

  const resultText = part.result ? cleanResult(part.result) : undefined;

  return (
    <div className="mt-3 mb-2 border border-(--chat-border) bg-(--chat-bg) rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full min-w-0 flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-wider text-(--chat-text-secondary) hover:bg-(--chat-bg-secondary) transition-colors ${explanation ? "normal-case" : "uppercase"}`}
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Wrench size={10} />
        <span className="min-w-0 flex-1 text-left font-medium truncate">
          {explanation || part.name}
        </span>
        {!isExpanded && ToolExtras && (
          <ToolExtras
            toolName={part.name}
            toolCallId={part.id}
            result={part.result}
            expanded={false}
          />
        )}
        <span className="shrink-0">{statusIcon}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-(--chat-border)">
          {ToolExtras && (
            <div className="px-2 py-1 text-[10px] bg-(--chat-warning-bg) text-(--chat-warning) flex items-center gap-1 flex-wrap">
              <ToolExtras
                toolName={part.name}
                toolCallId={part.id}
                result={part.result}
                expanded={true}
              />
            </div>
          )}
          {hasRestArgs && (
            <div className="px-2 py-1.5 text-xs">
              <div className="text-(--chat-text-muted) text-[10px] uppercase mb-1">
                args
              </div>
              <div className="markdown-content max-h-32 overflow-y-auto **:data-[streamdown=code-block]:my-0 **:data-[streamdown=code-block]:border-0">
                <Streamdown
                  plugins={{ code }}
                >{`\`\`\`json\n${JSON.stringify(rest, null, 2)}\n\`\`\``}</Streamdown>
              </div>
            </div>
          )}
          {codeBlocks.map((block) => (
            <div
              key={block.field}
              className={`px-2 py-1.5 text-xs ${hasRestArgs || codeBlocks.indexOf(block) > 0 ? "border-t border-(--chat-border)" : ""}`}
            >
              <div className="text-(--chat-text-muted) text-[10px] uppercase mb-1">
                {block.field}
              </div>
              <div className="markdown-content max-h-64 overflow-y-auto **:data-[streamdown=code-block]:my-0 **:data-[streamdown=code-block]:border-0">
                <Streamdown
                  plugins={{ code }}
                >{`\`\`\`${block.lang}\n${block.value}\n\`\`\``}</Streamdown>
              </div>
            </div>
          ))}
          {part.images && part.images.length > 0 && (
            <div className="px-2 py-1.5 border-t border-(--chat-border)">
              {part.images.map((img, imgIdx) => (
                <img
                  key={`${part.id}-img-${imgIdx}`}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={`Tool result ${imgIdx + 1}`}
                  className="max-w-full rounded-sm border border-(--chat-border)"
                />
              ))}
            </div>
          )}
          {resultText && (
            <div className="px-2 py-1.5 text-xs border-t border-(--chat-border)">
              <div className="text-(--chat-text-muted) text-[10px] uppercase mb-1">
                {part.status === "error" ? "error" : "result"}
              </div>
              <div
                className={`markdown-content max-h-40 overflow-y-auto **:data-[streamdown=code-block]:my-0 **:data-[streamdown=code-block]:border-0 ${part.status === "error" ? "[&_code]:text-red-400!" : ""}`}
              >
                <Streamdown
                  plugins={{ code }}
                >{`\`\`\`json\n${resultText}\n\`\`\``}</Streamdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChoiceCard({ choice }: { choice: ChoiceData }) {
  const { sendMessage, state } = useChat();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const toggle = useCallback(
    (id: string) => {
      if (submitted) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (choice.multiSelect) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          if (next.has(id)) next.clear();
          else {
            next.clear();
            next.add(id);
          }
        }
        return next;
      });
    },
    [choice.multiSelect, submitted],
  );

  const handleSubmit = useCallback(() => {
    if (selected.size === 0 || submitted) return;
    const labels = choice.options
      .filter((o) => selected.has(o.id))
      .map((o) => o.label);
    sendMessage(labels.join(", "));
    setSubmitted(true);
  }, [selected, submitted, choice.options, sendMessage]);

  return (
    <div className="mt-3 mb-2 border border-(--chat-border) bg-(--chat-bg) rounded-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-(--chat-bg-secondary) border-b border-(--chat-border)">
        <ListChecks size={12} className="text-(--chat-accent) shrink-0" />
        <span className="text-xs font-medium text-(--chat-text-primary) flex-1">
          {choice.question}
        </span>
        {choice.multiSelect && (
          <span className="text-[10px] text-(--chat-text-muted)">
            Select multiple
          </span>
        )}
      </div>

      <div className="p-1.5 flex flex-col gap-1">
        {choice.options.map((opt) => {
          const isSelected = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={submitted}
              onClick={() => toggle(opt.id)}
              className={`flex items-center gap-2 px-2.5 py-2 text-left transition-colors border ${
                isSelected
                  ? "border-(--chat-accent) bg-(--chat-accent)/10"
                  : "border-transparent hover:bg-(--chat-bg-secondary)"
              } ${submitted ? "opacity-60 cursor-default" : "cursor-pointer"}`}
              style={{ borderRadius: "var(--chat-radius)" }}
            >
              <div
                className={`shrink-0 w-4 h-4 flex items-center justify-center border transition-colors ${
                  isSelected
                    ? "border-(--chat-accent) bg-(--chat-accent) text-(--chat-bg)"
                    : "border-(--chat-text-muted)"
                }`}
                style={{
                  borderRadius: choice.multiSelect ? "3px" : "50%",
                }}
              >
                {isSelected && <Check size={10} strokeWidth={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-(--chat-text-primary)">
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="block text-[10px] text-(--chat-text-muted) mt-0.5">
                    {opt.description}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end px-2 py-1.5 border-t border-(--chat-border) bg-(--chat-bg-secondary)">
        {submitted ? (
          <span className="text-[10px] text-(--chat-text-muted) flex items-center gap-1">
            <CheckCircle2 size={10} />
            Submitted
          </span>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.size === 0 || state.isStreaming}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-(--chat-accent) text-(--chat-bg) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ borderRadius: "var(--chat-radius)" }}
          >
            <Send size={10} />
            Submit
          </button>
        )}
      </div>
    </div>
  );
}

function PlanStepRow({
  step,
  index,
  total,
  onToggle,
  onEdit,
  onRemove,
  onMove,
}: {
  step: PlanStep;
  index: number;
  total: number;
  onToggle: () => void;
  onEdit: (desc: string) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step.description);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      const ta = inputRef.current;
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onEdit(trimmed);
    setEditing(false);
  }, [draft, onEdit]);

  return (
    <div
      className={`group/step flex items-start gap-2 px-2 py-1.5 ${!step.checked ? "opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        checked={step.checked}
        onChange={onToggle}
        className="mt-0.5 shrink-0 accent-(--chat-accent)"
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={commit}
            className="w-full resize-none bg-transparent text-xs text-(--chat-text-primary) border-none outline-none border-b border-(--chat-border)"
            style={{ fontFamily: "var(--chat-font)" }}
          />
        ) : (
          <button
            type="button"
            className="text-left text-xs text-(--chat-text-primary) cursor-text w-full"
            onClick={() => {
              setDraft(step.description);
              setEditing(true);
            }}
          >
            {step.description}
          </button>
        )}
        {step.targets && step.targets.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {step.targets.map((t) => (
              <span
                key={t}
                className="text-[9px] px-1 py-0.5 bg-(--chat-accent)/10 text-(--chat-accent) border border-(--chat-accent)/20"
                style={{ borderRadius: "var(--chat-radius)" }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/step:opacity-100 transition-opacity">
        {index > 0 && (
          <button
            type="button"
            onClick={() => onMove(-1)}
            className="p-0.5 text-(--chat-text-muted) hover:text-(--chat-text-primary)"
            title="Move up"
          >
            <ArrowUp size={10} />
          </button>
        )}
        {index < total - 1 && (
          <button
            type="button"
            onClick={() => onMove(1)}
            className="p-0.5 text-(--chat-text-muted) hover:text-(--chat-text-primary)"
            title="Move down"
          >
            <ArrowDown size={10} />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 text-(--chat-text-muted) hover:text-(--chat-error)"
          title="Remove step"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

function PlanCard({ plan: initialPlan }: { plan: PlanData }) {
  const { executePlan, state } = useChat();
  const [steps, setSteps] = useState<PlanStep[]>(() =>
    initialPlan.steps.map((s) => ({ ...s })),
  );
  const [title] = useState(initialPlan.title);
  const [executing, setExecuting] = useState(false);

  const toggleStep = useCallback((id: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)),
    );
  }, []);

  const editStep = useCallback((id: string, description: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, description } : s)),
    );
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const moveStep = useCallback((id: string, dir: -1 | 1) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        id: generateId(),
        description: "New step",
        checked: true,
      },
    ]);
  }, []);

  const handleExecute = useCallback(async () => {
    const checked = steps.filter((s) => s.checked);
    if (checked.length === 0) return;
    const lines = checked.map((s, i) => {
      const targets =
        s.targets && s.targets.length > 0
          ? ` (targets: ${s.targets.join(", ")})`
          : "";
      return `${i + 1}. ${s.description}${targets}`;
    });
    const planText = `Execute the following plan. Complete each step in order:\n${lines.join("\n")}`;
    setExecuting(true);
    await executePlan(planText);
  }, [steps, executePlan]);

  const checkedCount = steps.filter((s) => s.checked).length;

  return (
    <div className="mt-3 mb-2 border border-(--chat-border) bg-(--chat-bg) rounded-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-(--chat-bg-secondary) border-b border-(--chat-border)">
        <ClipboardList size={12} className="text-(--chat-accent) shrink-0" />
        <span className="text-xs font-medium text-(--chat-text-primary) flex-1 truncate">
          {title}
        </span>
        <span className="text-[10px] text-(--chat-text-muted)">
          {checkedCount}/{steps.length}
        </span>
      </div>

      <div className="divide-y divide-(--chat-border)">
        {steps.map((step, idx) => (
          <PlanStepRow
            key={step.id}
            step={step}
            index={idx}
            total={steps.length}
            onToggle={() => toggleStep(step.id)}
            onEdit={(desc) => editStep(step.id, desc)}
            onRemove={() => removeStep(step.id)}
            onMove={(dir) => moveStep(step.id, dir)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between px-2 py-1.5 border-t border-(--chat-border) bg-(--chat-bg-secondary)">
        <button
          type="button"
          onClick={addStep}
          className="flex items-center gap-1 text-[10px] text-(--chat-text-muted) hover:text-(--chat-text-primary) transition-colors"
        >
          <Plus size={10} />
          Add step
        </button>
        <button
          type="button"
          onClick={handleExecute}
          disabled={checkedCount === 0 || executing || state.isStreaming}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-(--chat-accent) text-(--chat-bg) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ borderRadius: "var(--chat-radius)" }}
        >
          <Play size={10} />
          Execute Plan
        </button>
      </div>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div
      className="flex items-center gap-2 text-(--chat-text-muted) text-sm"
      style={{ fontFamily: "var(--chat-font)" }}
    >
      <Loader2 size={14} className="animate-spin" />
      <span>thinking...</span>
    </div>
  );
}

const MENTION_COLORS: Record<string, string> = {
  sheet:
    "bg-(--mention-sheet)/15 text-(--mention-sheet) border-(--mention-sheet)/30",
  file: "bg-(--mention-file)/15 text-(--mention-file) border-(--mention-file)/30",
  range:
    "bg-(--mention-range)/15 text-(--mention-range) border-(--mention-range)/30",
};

function inferMentionCategory(label: string): "sheet" | "file" | "range" {
  const dotIndex = label.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < label.length - 1) {
    return "file";
  }
  return "sheet";
}

function preprocessMentions(text: string): string {
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(
        /(^|\s)@([\w][\w-]*(?:\.[\w][\w-]*)*)/gm,
        "$1[@$2](mention:$2)",
      );
    })
    .join("");
}

function MentionLink({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { adapter } = useChat();

  if (href?.startsWith("mention:")) {
    const label = decodeURIComponent(href.slice(8));
    const category = inferMentionCategory(label);
    const colorClass = MENTION_COLORS[category] || MENTION_COLORS.sheet;
    return (
      <span
        className={`inline-flex items-center px-1 py-0 text-[0.8em] font-medium rounded-sm border cursor-default ${colorClass}`}
      >
        {children}
      </span>
    );
  }

  const AppLink = adapter.Link;
  if (AppLink && href) {
    return <AppLink href={href}>{children}</AppLink>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

const markdownComponents = { a: MentionLink };

function MarkdownContent({
  text,
  isAnimating,
}: {
  text: string;
  isAnimating?: boolean;
}) {
  return (
    <div className="markdown-content">
      <Streamdown
        plugins={{ code }}
        components={markdownComponents}
        isAnimating={isAnimating}
      >
        {preprocessMentions(text)}
      </Streamdown>
    </div>
  );
}

function renderParts(
  parts: MessagePart[],
  isStreaming: boolean,
  messageId: string,
) {
  const lastPart = parts[parts.length - 1];
  const isStreamingThinking = isStreaming && lastPart?.type === "thinking";
  const isStreamingText = isStreaming && lastPart?.type === "text";

  return parts.map((part, idx) => {
    const key =
      part.type === "toolCall" ? part.id : `${messageId}-${part.type}-${idx}`;
    const isLastPart = idx === parts.length - 1;
    if (part.type === "thinking") {
      return (
        <ThinkingBlock
          key={key}
          thinking={part.thinking}
          isStreaming={isStreamingThinking && isLastPart}
        />
      );
    }
    if (part.type === "toolCall") {
      return <ToolCallBlock key={key} part={part} />;
    }
    if (part.type === "plan") {
      return <PlanCard key={key} plan={part.plan} />;
    }
    if (part.type === "choice") {
      return <ChoiceCard key={key} choice={part.choice} />;
    }
    return (
      <MarkdownContent
        key={key}
        text={part.text}
        isAnimating={isStreamingText && isLastPart}
      />
    );
  });
}

function UserBubble({
  message,
  messageIndex,
}: {
  message: ChatMessage;
  messageIndex: number;
}) {
  const { editAndResend, adapter } = useChat();
  const { getFileMentionItems, state: localFilesState } = useLocalFiles();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const mentionStartRef = useRef<number>(-1);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const allMentionItems = useMemo(() => {
    if (!isEditing) return [];
    return localFilesState.folderName ? getFileMentionItems() : [];
  }, [isEditing, localFilesState.folderName, getFileMentionItems]);

  const [adapterMentionItems, setAdapterMentionItems] = useState<MentionItem[]>(
    [],
  );

  useEffect(() => {
    if (!isEditing || !adapter.getMentionableItems) {
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
  }, [isEditing, adapter]);

  const combinedMentionItems = useMemo(
    () => [...adapterMentionItems, ...allMentionItems],
    [adapterMentionItems, allMentionItems],
  );

  const startEdit = useCallback(() => {
    const text = message.parts
      .filter(
        (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
      )
      .map((p) => p.text)
      .join("\n");
    setEditText(text);
    setMentions([]);
    setMentionActive(false);
    setIsEditing(true);
  }, [message.parts]);

  useEffect(() => {
    if (isEditing && editRef.current) {
      const ta = editRef.current;
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.selectionEnd = ta.value.length;
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleEditChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setEditText(value);
      e.target.style.height = "auto";
      e.target.style.height = `${e.target.scrollHeight}px`;

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
    [],
  );

  const handleMentionSelect = useCallback(
    (item: MentionItem) => {
      const start = mentionStartRef.current;
      if (start < 0) return;

      const before = editText.slice(0, start);
      const cursorPos = editRef.current?.selectionStart ?? editText.length;
      const after = editText.slice(cursorPos);
      const newText = `${before}@${item.label} ${after}`;

      setEditText(newText);
      setMentionActive(false);
      setMentionQuery("");

      if (!mentions.find((m) => m.id === item.id)) {
        setMentions((prev) => [...prev, item]);
      }

      requestAnimationFrame(() => {
        const ta = editRef.current;
        if (ta) {
          const newPos = before.length + item.label.length + 2;
          ta.selectionStart = newPos;
          ta.selectionEnd = newPos;
          ta.focus();
        }
      });
    },
    [editText, mentions],
  );

  const submitEdit = useCallback(async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;

    let mentionedFiles: { name: string; content: string }[] | undefined;
    if (mentions.length > 0) {
      const files: { name: string; content: string }[] = [];
      for (const m of mentions) {
        try {
          const content = await m.resolveContent();
          files.push({ name: m.label, content });
        } catch {
          files.push({
            name: m.label,
            content: "[Error: could not read file]",
          });
        }
      }
      mentionedFiles = files;
    }

    setIsEditing(false);
    setMentions([]);
    editAndResend(messageIndex, trimmed, undefined, mentionedFiles);
  }, [editText, mentions, editAndResend, messageIndex]);

  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionActive) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitEdit();
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [mentionActive, submitEdit],
  );

  if (isEditing) {
    return (
      <div
        className="relative ml-8 px-3 py-2 text-sm leading-relaxed bg-(--chat-user-bg) border border-(--chat-border)"
        style={{
          borderRadius: "var(--chat-radius)",
          fontFamily: "var(--chat-font)",
        }}
      >
        <MentionPopup
          items={combinedMentionItems}
          query={mentionQuery}
          onSelect={handleMentionSelect}
          onClose={() => setMentionActive(false)}
          visible={mentionActive}
        />
        <textarea
          ref={editRef}
          value={editText}
          onChange={handleEditChange}
          onKeyDown={handleEditKeyDown}
          className="w-full resize-none bg-transparent text-(--chat-text-primary) border-none outline-none"
          style={{ fontFamily: "var(--chat-font)", lineHeight: "1.625" }}
        />
        <div className="flex justify-end gap-1.5 mt-1">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-2 py-0.5 text-[10px] text-(--chat-text-muted) hover:text-(--chat-text-primary) transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitEdit}
            className="px-2 py-0.5 text-[10px] bg-(--chat-accent) text-(--chat-bg) transition-colors"
            style={{ borderRadius: "var(--chat-radius)" }}
          >
            Save &amp; Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group/user relative ml-8 px-3 py-2 text-sm leading-relaxed bg-(--chat-user-bg) border border-(--chat-border)"
      style={{
        borderRadius: "var(--chat-radius)",
        fontFamily: "var(--chat-font)",
      }}
    >
      {renderParts(message.parts, false, message.id)}
      <button
        type="button"
        onClick={startEdit}
        className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover/user:opacity-100 text-(--chat-text-muted) hover:text-(--chat-text-primary) transition-opacity"
        title="Edit message"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

function AssistantBubble({
  messages,
  isStreaming,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
}) {
  const allParts: { part: MessagePart; messageId: string; isLast: boolean }[] =
    [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastMessage = i === messages.length - 1;
    for (let j = 0; j < msg.parts.length; j++) {
      allParts.push({
        part: msg.parts[j],
        messageId: msg.id,
        isLast: isLastMessage && j === msg.parts.length - 1,
      });
    }
  }

  return (
    <div
      className="text-sm leading-relaxed"
      style={{ fontFamily: "var(--chat-font)" }}
    >
      {allParts.map(({ part, messageId, isLast }, idx) => {
        const key =
          part.type === "toolCall"
            ? part.id
            : `${messageId}-${part.type}-${idx}`;
        if (part.type === "thinking") {
          return (
            <ThinkingBlock
              key={key}
              thinking={part.thinking}
              isStreaming={isStreaming && isLast}
            />
          );
        }
        if (part.type === "toolCall") {
          return <ToolCallBlock key={key} part={part} />;
        }
        if (part.type === "plan") {
          return <PlanCard key={key} plan={part.plan} />;
        }
        if (part.type === "choice") {
          return <ChoiceCard key={key} choice={part.choice} />;
        }
        return (
          <MarkdownContent
            key={key}
            text={part.text}
            isAnimating={isStreaming && isLast && part.type === "text"}
          />
        );
      })}
      {isStreaming && allParts.length === 0 && (
        <span className="animate-pulse">▊</span>
      )}
    </div>
  );
}

type MessageGroup =
  | { type: "user"; message: ChatMessage; messageIndex: number }
  | { type: "assistant"; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentAssistantGroup: ChatMessage[] = [];

  for (let idx = 0; idx < messages.length; idx++) {
    const msg = messages[idx];
    if (msg.role === "user") {
      if (currentAssistantGroup.length > 0) {
        groups.push({ type: "assistant", messages: currentAssistantGroup });
        currentAssistantGroup = [];
      }
      groups.push({ type: "user", message: msg, messageIndex: idx });
    } else {
      currentAssistantGroup.push(msg);
    }
  }

  if (currentAssistantGroup.length > 0) {
    groups.push({ type: "assistant", messages: currentAssistantGroup });
  }

  return groups;
}

export function MessageList() {
  const { state, adapter } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 100;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (containerRef.current && shouldAutoScroll.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [state.messages, state.isStreaming]);

  if (state.messages.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 text-center"
        style={{ fontFamily: "var(--chat-font)" }}
      >
        <div className="text-(--chat-text-muted) text-xs uppercase tracking-widest mb-2">
          no messages
        </div>
        <div className="text-(--chat-text-secondary) text-sm max-w-[200px]">
          {adapter.emptyStateMessage || "Start a conversation to get started"}
        </div>
      </div>
    );
  }

  const groups = groupMessages(state.messages);
  const lastMessage = state.messages[state.messages.length - 1];
  const showLoading = state.isStreaming && lastMessage?.role === "user";
  const lastGroup = groups[groups.length - 1];
  const isStreamingAssistant =
    state.isStreaming && lastGroup?.type === "assistant";

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-3 space-y-3"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: "var(--chat-scrollbar) transparent",
      }}
    >
      {groups.map((group, i) => {
        if (group.type === "user") {
          return (
            <UserBubble
              key={group.message.id}
              message={group.message}
              messageIndex={group.messageIndex}
            />
          );
        }
        const groupKey = group.messages[0].id;
        return (
          <AssistantBubble
            key={groupKey}
            messages={group.messages}
            isStreaming={isStreamingAssistant && i === groups.length - 1}
          />
        );
      })}
      {showLoading && <LoadingIndicator />}
    </div>
  );
}
