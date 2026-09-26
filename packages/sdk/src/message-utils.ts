import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  AssistantMessage,
  ImageContent,
  TextContent,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";

export type ToolCallStatus = "pending" | "running" | "complete" | "error";

export interface PlanStep {
  id: string;
  description: string;
  targets?: string[];
  checked: boolean;
}

export interface PlanData {
  title: string;
  steps: PlanStep[];
}

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface ChoiceData {
  question: string;
  options: ChoiceOption[];
  multiSelect?: boolean;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "plan"; plan: PlanData }
  | { type: "choice"; choice: ChoiceData }
  | {
      type: "toolCall";
      id: string;
      name: string;
      args: Record<string, unknown>;
      status: ToolCallStatus;
      result?: string;
      images?: { data: string; mimeType: string }[];
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  timestamp: number;
}

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalCost: number;
  contextWindow: number;
  lastInputTokens: number;
}

export function stripEnrichment(
  content: string | { type: string; text?: string }[],
  metadataTag?: string,
): string {
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else {
    text = content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  }
  text = text.replace(/^<mode>\w+<\/mode>\n\n/, "");
  text = text.replace(/^<attachments>\n[\s\S]*?\n<\/attachments>\n\n/, "");
  if (metadataTag) {
    const escaped = metadataTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`^<${escaped}>\\n[\\s\\S]*?\\n</${escaped}>\\n\\n`),
      "",
    );
  } else {
    text = text.replace(/^<\w+_context>\n[\s\S]*?\n<\/\w+_context>\n\n/, "");
  }
  return text;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const FENCED_BLOCK_RE = /```(plan|choice)\s*\n([\s\S]*?)```/;

export function parseFencedBlocks(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let remaining = text;

  while (true) {
    const match = FENCED_BLOCK_RE.exec(remaining);
    if (!match) break;

    const before = remaining.slice(0, match.index);
    if (before.trim()) {
      parts.push({ type: "text", text: before });
    }

    const fenceType = match[1];
    try {
      const raw = JSON.parse(match[2]);
      if (fenceType === "plan") {
        const steps: PlanStep[] = (raw.steps ?? []).map(
          (
            s: { id?: string; description?: string; targets?: string[] },
            i: number,
          ) => ({
            id: s.id ?? String(i + 1),
            description: s.description ?? "",
            targets: s.targets,
            checked: true,
          }),
        );
        parts.push({
          type: "plan",
          plan: { title: raw.title ?? "Plan", steps },
        });
      } else {
        const options: ChoiceOption[] = (raw.options ?? []).map(
          (
            o: { id?: string; label?: string; description?: string },
            i: number,
          ) => ({
            id: o.id ?? String(i + 1),
            label: o.label ?? "",
            description: o.description,
          }),
        );
        parts.push({
          type: "choice",
          choice: {
            question: raw.question ?? "Choose an option",
            options,
            multiSelect: raw.multiSelect ?? false,
          },
        });
      }
    } catch {
      parts.push({ type: "text", text: match[0] });
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  if (remaining.trim()) {
    parts.push({ type: "text", text: remaining });
  }
  return parts;
}

export function extractPartsFromAssistantMessage(
  message: AgentMessage,
  existingParts: MessagePart[] = [],
): MessagePart[] {
  if (message.role !== "assistant") return existingParts;

  const assistantMsg = message as AssistantMessage;
  const existingToolCalls = new Map<string, MessagePart>();
  for (const part of existingParts) {
    if (part.type === "toolCall") {
      existingToolCalls.set(part.id, part);
    }
  }

  const result: MessagePart[] = [];
  for (const block of assistantMsg.content) {
    if (block.type === "text") {
      if (FENCED_BLOCK_RE.test(block.text)) {
        result.push(...parseFencedBlocks(block.text));
      } else {
        result.push({ type: "text", text: block.text });
      }
    } else if (block.type === "thinking") {
      result.push({ type: "thinking", thinking: block.thinking });
    } else {
      const existing = existingToolCalls.get(block.id);
      result.push({
        type: "toolCall",
        id: block.id,
        name: block.name,
        args: block.arguments as Record<string, unknown>,
        status: existing?.type === "toolCall" ? existing.status : "pending",
        result: existing?.type === "toolCall" ? existing.result : undefined,
      });
    }
  }
  return result;
}

export function agentMessagesToChatMessages(
  agentMessages: AgentMessage[],
  metadataTag?: string,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const msg of agentMessages) {
    if (msg.role === "user") {
      const text = stripEnrichment((msg as UserMessage).content, metadataTag);
      result.push({
        id: generateId(),
        role: "user",
        parts: [{ type: "text", text }],
        timestamp: msg.timestamp,
      });
    } else if (msg.role === "assistant") {
      const parts = extractPartsFromAssistantMessage(msg);
      result.push({
        id: generateId(),
        role: "assistant",
        parts,
        timestamp: msg.timestamp,
      });
    } else if (msg.role === "toolResult") {
      const toolResult = msg as ToolResultMessage;
      for (let i = result.length - 1; i >= 0; i--) {
        const chatMsg = result[i];
        if (chatMsg.role !== "assistant") continue;
        const partIdx = chatMsg.parts.findIndex(
          (p) => p.type === "toolCall" && p.id === toolResult.toolCallId,
        );
        if (partIdx !== -1) {
          const part = chatMsg.parts[partIdx];
          if (part.type === "toolCall") {
            const resultText = toolResult.content
              .filter((c): c is TextContent => c.type === "text")
              .map((c) => c.text)
              .join("\n");
            const images = toolResult.content
              .filter((c): c is ImageContent => c.type === "image")
              .map((c) => ({ data: c.data, mimeType: c.mimeType }));
            chatMsg.parts[partIdx] = {
              ...part,
              status: toolResult.isError ? "error" : "complete",
              result: resultText,
              images: images.length > 0 ? images : undefined,
            };
          }
          break;
        }
      }
    }
  }
  return result;
}

export function deriveStats(
  agentMessages: AgentMessage[],
): Omit<SessionStats, "contextWindow"> {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let totalCost = 0;
  let lastInputTokens = 0;
  for (const msg of agentMessages) {
    if (msg.role === "assistant") {
      const u = (msg as AssistantMessage).usage;
      if (u) {
        inputTokens += u.input;
        outputTokens += u.output;
        cacheRead += u.cacheRead;
        cacheWrite += u.cacheWrite;
        totalCost += u.cost.total;
        lastInputTokens = u.input + u.cacheRead + u.cacheWrite;
      }
    }
  }
  return {
    inputTokens,
    outputTokens,
    cacheRead,
    cacheWrite,
    totalCost,
    lastInputTokens,
  };
}
