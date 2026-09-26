import {
  Agent,
  type AgentEvent,
  type ThinkingLevel as AgentThinkingLevel,
  type AgentTool,
} from "@mariozechner/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  getModel,
  getModels,
  getProviders,
  type Model,
  streamSimple,
} from "@mariozechner/pi-ai";
import type { CustomCommand } from "just-bash/browser";
import {
  agentMessagesToChatMessages,
  type ChatMessage,
  deriveStats,
  extractPartsFromAssistantMessage,
  generateId,
  type PlanData,
  parseFencedBlocks,
  type SessionStats,
} from "./message-utils";
import {
  loadOAuthCredentials,
  refreshOAuthToken,
  saveOAuthCredentials,
} from "./oauth";
import {
  applyProxyToModel,
  buildCustomModel,
  type ChatMode,
  loadSavedConfig,
  type ProviderConfig,
  saveConfig,
  type ThinkingLevel,
} from "./provider-config";
import {
  addSkill,
  getInstalledSkills,
  removeSkill,
  type SkillMeta,
  syncSkillsToVfs,
} from "./skills";
import {
  type ChatSession,
  createSession,
  deleteSession,
  getOrCreateCurrentSession,
  getSession,
  listSessions,
  loadVfsFiles,
  saveSession,
  saveVfsFiles,
} from "./storage";
import {
  deleteFile,
  listUploads,
  resetVfs,
  restoreVfs,
  setCustomCommands,
  setStaticFiles,
  snapshotVfs,
  writeFile,
} from "./vfs";

export interface RuntimeAdapter {
  tools: AgentTool[];
  readOnlyToolNames?: string[];
  buildSystemPrompt: (skills: SkillMeta[]) => string;
  getDocumentId: () => Promise<string>;
  getDocumentMetadata?: () => Promise<{
    metadata: object;
    nameMap?: Record<number, string>;
  } | null>;
  onToolResult?: (toolCallId: string, result: string, isError: boolean) => void;
  metadataTag?: string;
  staticFiles?: Record<string, string>;
  customCommands?: () => CustomCommand[];
  autoGreeting?: () => Promise<string | null>;
}

export interface UploadedFile {
  name: string;
  size: number;
}

export interface RuntimeState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  providerConfig: ProviderConfig | null;
  chatMode: ChatMode;
  activePlan: PlanData | null;
  sessionStats: SessionStats;
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  nameMap: Record<number, string>;
  uploads: UploadedFile[];
  isUploading: boolean;
  skills: SkillMeta[];
}

type StateListener = (state: RuntimeState) => void;

const INITIAL_STATS: SessionStats = { ...deriveStats([]), contextWindow: 0 };

function thinkingLevelToAgent(level: ThinkingLevel): AgentThinkingLevel {
  return level === "none" ? "off" : level;
}

export class AgentRuntime {
  private agent: Agent | null = null;
  private config: ProviderConfig | null = null;
  private pendingConfig: ProviderConfig | null = null;
  private streamingMessageId: string | null = null;
  private isStreaming = false;
  private documentId: string | null = null;
  private currentSessionId: string | null = null;
  private sessionLoaded = false;
  private followMode = true;
  private skills: SkillMeta[] = [];
  private adapter: RuntimeAdapter;
  private listeners: Set<StateListener> = new Set();
  private state: RuntimeState;

  constructor(adapter: RuntimeAdapter) {
    this.adapter = adapter;
    const saved = loadSavedConfig();
    const validConfig =
      saved?.provider && saved?.apiKey && saved?.model ? saved : null;
    this.followMode = validConfig?.followMode ?? true;
    this.state = {
      messages: [],
      isStreaming: false,
      error: null,
      providerConfig: validConfig,
      chatMode: validConfig?.chatMode ?? "agent",
      activePlan: null,
      sessionStats: INITIAL_STATS,
      currentSession: null,
      sessions: [],
      nameMap: {},
      uploads: [],
      isUploading: false,
      skills: [],
    };
  }

  getState(): RuntimeState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private update(partial: Partial<RuntimeState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private updateMessages(
    updater: (messages: ChatMessage[]) => ChatMessage[],
    extra?: Partial<RuntimeState>,
  ) {
    this.state = {
      ...this.state,
      messages: updater(this.state.messages),
      ...extra,
    };
    this.emit();
  }

  setAdapter(adapter: RuntimeAdapter) {
    this.adapter = adapter;
  }

  getAvailableProviders(): string[] {
    return getProviders();
  }

  getModelsForProvider(provider: string): Model<Api>[] {
    try {
      return (getModels as (p: string) => Model<Api>[])(provider);
    } catch {
      return [];
    }
  }

  private async getActiveApiKey(config: ProviderConfig): Promise<string> {
    if (config.authMethod !== "oauth") {
      return config.apiKey;
    }
    const creds = loadOAuthCredentials(config.provider);
    if (!creds) return config.apiKey;
    if (Date.now() < creds.expires) {
      return creds.access;
    }
    const refreshed = await refreshOAuthToken(
      config.provider,
      creds.refresh,
      config.proxyUrl,
      config.useProxy,
    );
    saveOAuthCredentials(config.provider, refreshed);
    return refreshed.access;
  }

  private handleAgentEvent = (event: AgentEvent) => {
    console.log("[Runtime] Agent event:", event.type, event);
    switch (event.type) {
      case "message_start": {
        if (event.message.role === "assistant") {
          const id = generateId();
          this.streamingMessageId = id;
          const parts = extractPartsFromAssistantMessage(event.message);
          const chatMessage: ChatMessage = {
            id,
            role: "assistant",
            parts,
            timestamp: event.message.timestamp,
          };
          this.updateMessages((msgs) => [...msgs, chatMessage]);
        }
        break;
      }
      case "message_update": {
        if (event.message.role === "assistant" && this.streamingMessageId) {
          const streamId = this.streamingMessageId;
          this.updateMessages((msgs) => {
            const messages = [...msgs];
            const idx = messages.findIndex((m) => m.id === streamId);
            if (idx !== -1) {
              const parts = extractPartsFromAssistantMessage(
                event.message,
                messages[idx].parts,
              );
              messages[idx] = { ...messages[idx], parts };
            }
            return messages;
          });
        }
        break;
      }
      case "message_end": {
        if (event.message.role === "assistant") {
          const assistantMsg = event.message as AssistantMessage;
          const isError =
            assistantMsg.stopReason === "error" ||
            assistantMsg.stopReason === "aborted";
          const streamId = this.streamingMessageId;

          let detectedPlan: PlanData | null = null;
          this.updateMessages(
            (msgs) => {
              const messages = [...msgs];
              const idx = messages.findIndex((m) => m.id === streamId);

              if (isError) {
                if (idx !== -1) {
                  messages.splice(idx, 1);
                }
              } else if (idx !== -1) {
                const parts = extractPartsFromAssistantMessage(
                  event.message,
                  messages[idx].parts,
                );
                messages[idx] = { ...messages[idx], parts };
                const planPart = parts.find((p) => p.type === "plan");
                if (planPart?.type === "plan") {
                  detectedPlan = planPart.plan;
                }
              }
              return messages;
            },
            {
              error: isError
                ? assistantMsg.errorMessage || "Request failed"
                : this.state.error,
              sessionStats: isError
                ? this.state.sessionStats
                : {
                    ...deriveStats(this.agent?.state.messages ?? []),
                    contextWindow: this.state.sessionStats.contextWindow,
                  },
              ...(detectedPlan ? { activePlan: detectedPlan } : {}),
            },
          );
          this.streamingMessageId = null;
        }
        break;
      }
      case "tool_execution_start": {
        this.updateMessages((msgs) => {
          const messages = [...msgs];
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const partIdx = msg.parts.findIndex(
              (p) => p.type === "toolCall" && p.id === event.toolCallId,
            );
            if (partIdx !== -1) {
              const parts = [...msg.parts];
              const part = parts[partIdx];
              if (part.type === "toolCall") {
                parts[partIdx] = { ...part, status: "running" };
                messages[i] = { ...msg, parts };
              }
              break;
            }
          }
          return messages;
        });
        break;
      }
      case "tool_execution_update": {
        this.updateMessages((msgs) => {
          const messages = [...msgs];
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const partIdx = msg.parts.findIndex(
              (p) => p.type === "toolCall" && p.id === event.toolCallId,
            );
            if (partIdx !== -1) {
              const parts = [...msg.parts];
              const part = parts[partIdx];
              if (part.type === "toolCall") {
                let partialText: string;
                if (typeof event.partialResult === "string") {
                  partialText = event.partialResult;
                } else if (
                  event.partialResult?.content &&
                  Array.isArray(event.partialResult.content)
                ) {
                  partialText = event.partialResult.content
                    .filter((c: { type: string }) => c.type === "text")
                    .map((c: { text: string }) => c.text)
                    .join("\n");
                } else {
                  partialText = JSON.stringify(event.partialResult, null, 2);
                }
                parts[partIdx] = { ...part, result: partialText };
                messages[i] = { ...msg, parts };
              }
              break;
            }
          }
          return messages;
        });
        break;
      }
      case "tool_execution_end": {
        let resultText: string;
        let resultImages: { data: string; mimeType: string }[] | undefined;
        if (typeof event.result === "string") {
          resultText = event.result;
        } else if (
          event.result?.content &&
          Array.isArray(event.result.content)
        ) {
          resultText = event.result.content
            .filter((c: { type: string }) => c.type === "text")
            .map((c: { text: string }) => c.text)
            .join("\n");
          const images = event.result.content
            .filter((c: { type: string }) => c.type === "image")
            .map((c: { data: string; mimeType: string }) => ({
              data: c.data,
              mimeType: c.mimeType,
            }));
          if (images.length > 0) resultImages = images;
        } else {
          resultText = JSON.stringify(event.result, null, 2);
        }

        if (!event.isError && this.followMode) {
          this.adapter.onToolResult?.(event.toolCallId, resultText, false);
        }

        this.updateMessages((msgs) => {
          const messages = [...msgs];
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const partIdx = msg.parts.findIndex(
              (p) => p.type === "toolCall" && p.id === event.toolCallId,
            );
            if (partIdx !== -1) {
              const parts = [...msg.parts];
              const part = parts[partIdx];
              if (part.type === "toolCall") {
                parts[partIdx] = {
                  ...part,
                  status: event.isError ? "error" : "complete",
                  result: resultText,
                  images: resultImages,
                };
                messages[i] = { ...msg, parts };
              }
              break;
            }
          }
          return messages;
        });
        break;
      }
      case "agent_end": {
        this.isStreaming = false;
        this.streamingMessageId = null;
        this.update({ isStreaming: false });
        this.onStreamingEnd();
        break;
      }
    }
  };

  private getToolsForMode(mode: ChatMode): AgentTool[] {
    if (mode === "agent") return this.adapter.tools;
    const readOnly = new Set(this.adapter.readOnlyToolNames ?? []);
    if (readOnly.size === 0) return this.adapter.tools;
    return this.adapter.tools.filter((t) => readOnly.has(t.name));
  }

  private buildSystemPromptForMode(mode: ChatMode): string {
    const base = this.adapter.buildSystemPrompt(this.skills);

    const choiceFormatBlock = `

## Interactive Choice Cards
When you need the user to pick from a set of options, output a fenced code block with the language tag "choice" containing valid JSON. The UI renders this as a clickable card with checkboxes. Do NOT write choices as plain-text numbered lists — always use this format:

\`\`\`choice
{"question":"Your question here","options":[{"id":"a","label":"Option A","description":"Details about A"},{"id":"b","label":"Option B","description":"Details about B"}],"multiSelect":true}
\`\`\`

Rules for choice JSON:
- "question" is the prompt shown at the top of the card.
- Each option has a unique "id", a "label" shown to the user, and an optional "description".
- Set "multiSelect" to true if the user can pick more than one option.
- You may include explanatory text before or after the choice block.
- You can include MULTIPLE choice blocks in one message. Always put all questions in a single response — never split them across turns.
- NEVER write questions as plain text when a choice card is more appropriate.`;

    if (mode === "ask") {
      return `${base}${choiceFormatBlock}\n\nYou are in ASK mode. You may read and analyze the document using available tools, but you MUST NOT make any modifications. Answer questions, explain data, and provide analysis only.`;
    }
    if (mode === "plan") {
      return `${base}${choiceFormatBlock}\n\nYou are in PLAN mode. You may read the document to gather context using available tools. Do NOT execute any write operations.

Your workflow:
1. If the user's request is ambiguous, first ask 1-3 short clarifying questions. Wait for answers before producing the plan.
2. Once you have enough context, produce a structured plan inside a fenced code block with the language tag "plan". The block must contain valid JSON matching this schema:

\`\`\`plan
{
  "title": "Short plan title",
  "steps": [
    { "id": "1", "description": "What to do in this step", "targets": ["Sheet1!A1:C10"] },
    { "id": "2", "description": "Next step description", "targets": ["Assumptions!D5"] }
  ]
}
\`\`\`

Rules for the plan JSON:
- "title" is a short summary of the plan.
- Each step has a unique "id", a human-readable "description", and an optional "targets" array of sheet/cell/range references that the step affects.
- Be specific: reference actual sheet names, cell ranges, and describe the exact change.
- You may include explanatory text before or after the plan block.`;
    }
    return `${base}${choiceFormatBlock}`;
  }

  applyConfig(config: ProviderConfig) {
    let contextWindow = 0;
    let baseModel: Model<Api>;
    if (config.provider === "custom") {
      const custom = buildCustomModel(config);
      if (!custom) return;
      baseModel = custom;
    } else {
      try {
        baseModel = (getModel as (p: string, m: string) => Model<Api>)(
          config.provider,
          config.model,
        );
      } catch {
        return;
      }
    }
    contextWindow = baseModel.contextWindow;
    this.config = config;

    const proxiedModel = applyProxyToModel(baseModel, config);
    const existingMessages = this.agent?.state.messages ?? [];

    if (this.agent) {
      this.agent.abort();
    }

    const mode = config.chatMode ?? "agent";
    const systemPrompt = this.buildSystemPromptForMode(mode);
    const tools = this.getToolsForMode(mode);

    const agent = new Agent({
      initialState: {
        model: proxiedModel,
        systemPrompt,
        thinkingLevel: thinkingLevelToAgent(config.thinking),
        tools,
        messages: existingMessages,
      },
      streamFn: async (model, context, options) => {
        const cfg = this.config ?? config;
        const apiKey = await this.getActiveApiKey(cfg);
        return streamSimple(model, context, {
          ...options,
          apiKey,
        });
      },
    });
    this.agent = agent;
    agent.subscribe(this.handleAgentEvent);
    this.pendingConfig = null;
    this.followMode = config.followMode ?? true;

    this.update({
      providerConfig: config,
      chatMode: mode,
      error: null,
      sessionStats: {
        ...this.state.sessionStats,
        contextWindow,
      },
    });
  }

  setProviderConfig(config: ProviderConfig) {
    if (this.isStreaming) {
      this.pendingConfig = config;
      this.update({ providerConfig: config });
      return;
    }
    this.applyConfig(config);
  }

  abort() {
    this.agent?.abort();
    this.isStreaming = false;
    this.update({ isStreaming: false });
  }

  async sendMessage(
    content: string,
    attachments?: string[],
    mentionedFiles?: { name: string; content: string }[],
  ) {
    if (this.isStreaming) {
      this.abort();
      await this.agent?.waitForIdle();
    }

    if (this.pendingConfig) {
      this.applyConfig(this.pendingConfig);
    }
    const agent = this.agent;
    if (!agent || !this.state.providerConfig) {
      this.update({ error: "Please configure your API key first" });
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      parts: [{ type: "text", text: content }],
      timestamp: Date.now(),
    };

    this.isStreaming = true;
    this.update({
      messages: [...this.state.messages, userMessage],
      isStreaming: true,
      error: null,
    });

    try {
      let promptContent = content;

      const allAttachments = [...(attachments ?? [])];

      if (mentionedFiles && mentionedFiles.length > 0) {
        for (const f of mentionedFiles) {
          await writeFile(f.name, f.content);
          allAttachments.push(f.name);
        }
      }

      if (this.adapter.getDocumentMetadata) {
        try {
          const meta = await this.adapter.getDocumentMetadata();
          if (meta) {
            const tag = this.adapter.metadataTag || "doc_context";
            promptContent = `<${tag}>\n${JSON.stringify(meta.metadata, null, 2)}\n</${tag}>\n\n${promptContent}`;
            if (meta.nameMap) {
              this.update({ nameMap: meta.nameMap });
            }
          }
        } catch (err) {
          console.error("[Runtime] Failed to get document metadata:", err);
        }
      }

      if (allAttachments.length > 0) {
        const paths = allAttachments
          .map((name) => `/home/user/uploads/${name}`)
          .join("\n");
        promptContent = `<attachments>\n${paths}\n</attachments>\n\n${promptContent}`;
      }

      const mode = this.state.chatMode;
      if (mode !== "agent") {
        promptContent = `<mode>${mode}</mode>\n\n${promptContent}`;
      }

      await agent.prompt(promptContent);
    } catch (err) {
      console.error("[Runtime] sendMessage error:", err);
      this.isStreaming = false;
      this.update({
        isStreaming: false,
        error: err instanceof Error ? err.message : "An error occurred",
      });
    }
  }

  async editAndResend(
    messageIndex: number,
    newContent: string,
    attachments?: string[],
    mentionedFiles?: { name: string; content: string }[],
  ) {
    if (this.isStreaming) {
      this.abort();
      await this.agent?.waitForIdle();
    }

    const agent = this.agent;
    if (!agent) return;

    const targetMsg = this.state.messages[messageIndex];
    if (!targetMsg || targetMsg.role !== "user") return;

    let targetUserOrdinal = 0;
    for (let i = 0; i <= messageIndex; i++) {
      if (this.state.messages[i].role === "user") targetUserOrdinal++;
    }

    const agentMessages = agent.state.messages;
    let userCount = 0;
    let agentCutIndex = agentMessages.length;
    for (let i = 0; i < agentMessages.length; i++) {
      if (agentMessages[i].role === "user") {
        userCount++;
        if (userCount === targetUserOrdinal) {
          agentCutIndex = i;
          break;
        }
      }
    }

    agent.replaceMessages(agentMessages.slice(0, agentCutIndex));

    const truncatedChatMessages = this.state.messages.slice(0, messageIndex);
    this.update({ messages: truncatedChatMessages, error: null });

    await this.sendMessage(newContent, attachments, mentionedFiles);
  }

  clearMessages() {
    this.abort();
    this.agent?.reset();
    resetVfs();
    if (this.currentSessionId) {
      Promise.all([
        saveSession(this.currentSessionId, []),
        saveVfsFiles(this.currentSessionId, []),
      ]).catch(console.error);
    }
    this.update({
      messages: [],
      error: null,
      activePlan: null,
      sessionStats: INITIAL_STATS,
      uploads: [],
    });
  }

  private async refreshSessions() {
    if (!this.documentId) return;
    const sessions = await listSessions(this.documentId);
    this.update({ sessions });
  }

  async newSession() {
    if (!this.documentId) return;
    if (this.isStreaming) return;
    try {
      this.agent?.reset();
      resetVfs();
      const session = await createSession(this.documentId);
      this.currentSessionId = session.id;
      await this.refreshSessions();
      this.update({
        messages: [],
        currentSession: session,
        error: null,
        sessionStats: INITIAL_STATS,
        uploads: [],
      });

      if (this.adapter.autoGreeting) {
        try {
          const greeting = await this.adapter.autoGreeting();
          if (greeting) {
            const greetingMessage: ChatMessage = {
              id: generateId(),
              role: "assistant",
              parts: parseFencedBlocks(greeting),
              timestamp: Date.now(),
            };
            this.update({
              messages: [greetingMessage],
            });
          }
        } catch (err) {
          console.error("[Runtime] autoGreeting error:", err);
        }
      }
    } catch (err) {
      console.error("[Runtime] Failed to create session:", err);
    }
  }

  async switchSession(sessionId: string) {
    if (this.currentSessionId === sessionId) return;
    if (this.isStreaming) return;
    this.agent?.reset();
    try {
      const [session, vfsFiles] = await Promise.all([
        getSession(sessionId),
        loadVfsFiles(sessionId),
      ]);
      if (!session) return;
      await restoreVfs(vfsFiles);
      this.currentSessionId = session.id;

      if (session.agentMessages.length > 0 && this.agent) {
        this.agent.replaceMessages(session.agentMessages);
      }

      const uploadNames = await listUploads();
      const stats = deriveStats(session.agentMessages);
      this.update({
        messages: agentMessagesToChatMessages(
          session.agentMessages,
          this.adapter.metadataTag,
        ),
        currentSession: session,
        error: null,
        activePlan: null,
        sessionStats: {
          ...stats,
          contextWindow: this.state.sessionStats.contextWindow,
        },
        uploads: uploadNames.map((name) => ({ name, size: 0 })),
      });
    } catch (err) {
      console.error("[Runtime] Failed to switch session:", err);
    }
  }

  async deleteCurrentSession() {
    if (!this.currentSessionId || !this.documentId) return;
    if (this.isStreaming) return;
    this.agent?.reset();
    const deletedId = this.currentSessionId;
    await Promise.all([deleteSession(deletedId), saveVfsFiles(deletedId, [])]);
    const session = await getOrCreateCurrentSession(this.documentId);
    this.currentSessionId = session.id;
    const vfsFiles = await loadVfsFiles(session.id);
    await restoreVfs(vfsFiles);

    if (session.agentMessages.length > 0 && this.agent) {
      this.agent.replaceMessages(session.agentMessages);
    }

    await this.refreshSessions();
    const uploadNames = await listUploads();
    const stats = deriveStats(session.agentMessages);
    this.update({
      messages: agentMessagesToChatMessages(
        session.agentMessages,
        this.adapter.metadataTag,
      ),
      currentSession: session,
      error: null,
      sessionStats: {
        ...stats,
        contextWindow: this.state.sessionStats.contextWindow,
      },
      uploads: uploadNames.map((name) => ({ name, size: 0 })),
    });
  }

  private async onStreamingEnd() {
    if (!this.currentSessionId) return;
    const sessionId = this.currentSessionId;
    const agentMessages = this.agent?.state.messages ?? [];
    try {
      const vfsFiles = await snapshotVfs();
      await Promise.all([
        saveSession(sessionId, agentMessages),
        saveVfsFiles(sessionId, vfsFiles),
      ]);
      await this.refreshSessions();
      const updated = await getSession(sessionId);
      if (updated) {
        this.update({ currentSession: updated });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async init() {
    if (this.sessionLoaded) return;
    this.sessionLoaded = true;

    if (this.adapter.staticFiles) {
      setStaticFiles(this.adapter.staticFiles);
    }
    if (this.adapter.customCommands) {
      setCustomCommands(this.adapter.customCommands);
    }

    try {
      const id = await this.adapter.getDocumentId();
      this.documentId = id;

      const skills = await getInstalledSkills();
      this.skills = skills;
      await syncSkillsToVfs();

      const saved = loadSavedConfig();
      if (saved?.provider && saved?.apiKey && saved?.model) {
        this.applyConfig(saved);
      }

      const session = await getOrCreateCurrentSession(id);
      this.currentSessionId = session.id;
      const [sessions, vfsFiles] = await Promise.all([
        listSessions(id),
        loadVfsFiles(session.id),
      ]);
      if (vfsFiles.length > 0) {
        await restoreVfs(vfsFiles);
      }

      if (session.agentMessages.length > 0 && this.agent) {
        this.agent.replaceMessages(session.agentMessages);
      }

      const uploadNames = await listUploads();
      const stats = deriveStats(session.agentMessages);
      this.update({
        messages: agentMessagesToChatMessages(
          session.agentMessages,
          this.adapter.metadataTag,
        ),
        currentSession: session,
        sessions,
        skills,
        sessionStats: {
          ...stats,
          contextWindow: this.state.sessionStats.contextWindow,
        },
        uploads: uploadNames.map((name) => ({ name, size: 0 })),
      });

      if (session.agentMessages.length === 0 && this.adapter.autoGreeting) {
        try {
          const greeting = await this.adapter.autoGreeting();
          if (greeting) {
            const greetingMessage: ChatMessage = {
              id: generateId(),
              role: "assistant",
              parts: parseFencedBlocks(greeting),
              timestamp: Date.now(),
            };
            this.update({
              messages: [greetingMessage],
            });
          }
        } catch (err) {
          console.error("[Runtime] autoGreeting error:", err);
        }
      }
    } catch (err) {
      console.error("[Runtime] Failed to load session:", err);
    }
  }

  async uploadFiles(files: { name: string; size: number; data: Uint8Array }[]) {
    if (files.length === 0) return;
    this.update({ isUploading: true });
    try {
      for (const file of files) {
        await writeFile(file.name, file.data);
        const uploads = [...this.state.uploads];
        const exists = uploads.findIndex((u) => u.name === file.name);
        if (exists !== -1) {
          uploads[exists] = { name: file.name, size: file.size };
        } else {
          uploads.push({ name: file.name, size: file.size });
        }
        this.update({ uploads });
      }
      if (this.currentSessionId) {
        const snapshot = await snapshotVfs();
        await saveVfsFiles(this.currentSessionId, snapshot);
      }
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      this.update({ isUploading: false });
    }
  }

  async removeUpload(name: string) {
    try {
      await deleteFile(name);
      this.update({
        uploads: this.state.uploads.filter((u) => u.name !== name),
      });
      if (this.currentSessionId) {
        const snapshot = await snapshotVfs();
        await saveVfsFiles(this.currentSessionId, snapshot);
      }
    } catch (err) {
      console.error("Failed to delete file:", err);
      this.update({
        uploads: this.state.uploads.filter((u) => u.name !== name),
      });
    }
  }

  private async refreshSkillsAndRebuildAgent() {
    this.skills = await getInstalledSkills();
    this.update({ skills: this.skills });
    if (this.state.providerConfig) {
      this.applyConfig(this.state.providerConfig);
    }
  }

  async installSkill(inputs: { path: string; data: Uint8Array }[]) {
    if (inputs.length === 0) return;
    try {
      await addSkill(inputs);
      await this.refreshSkillsAndRebuildAgent();
    } catch (err) {
      console.error("[Runtime] Failed to install skill:", err);
      this.update({
        error: err instanceof Error ? err.message : "Failed to install skill",
      });
    }
  }

  async uninstallSkill(name: string) {
    try {
      await removeSkill(name);
      await this.refreshSkillsAndRebuildAgent();
    } catch (err) {
      console.error("[Runtime] Failed to uninstall skill:", err);
    }
  }

  toggleFollowMode() {
    if (!this.state.providerConfig) return;
    const newFollowMode = !this.state.providerConfig.followMode;
    this.followMode = newFollowMode;
    const newConfig = {
      ...this.state.providerConfig,
      followMode: newFollowMode,
    };
    saveConfig(newConfig);
    this.update({ providerConfig: newConfig });
  }

  toggleExpandToolCalls() {
    if (!this.state.providerConfig) return;
    const newConfig = {
      ...this.state.providerConfig,
      expandToolCalls: !this.state.providerConfig.expandToolCalls,
    };
    saveConfig(newConfig);
    this.update({ providerConfig: newConfig });
  }

  setChatMode(mode: ChatMode) {
    if (!this.state.providerConfig) return;
    if (mode === this.state.chatMode) return;
    const newConfig = { ...this.state.providerConfig, chatMode: mode };
    saveConfig(newConfig);

    if (this.agent) {
      this.agent.setTools(this.getToolsForMode(mode));
      this.agent.setSystemPrompt(this.buildSystemPromptForMode(mode));
    }
    this.update({ providerConfig: newConfig, chatMode: mode });
  }

  async executePlan(planText: string) {
    this.setChatMode("agent");
    this.update({ activePlan: null });
    await this.sendMessage(planText);
  }

  getName(id: number): string | undefined {
    return this.state.nameMap[id];
  }

  dispose() {
    this.agent?.abort();
    this.listeners.clear();
  }
}
