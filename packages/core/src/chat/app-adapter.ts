import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { SkillMeta, StorageNamespace } from "@office-agents/sdk";
import type { CustomCommand } from "just-bash/browser";
import type { ComponentType } from "react";
import type { MentionItem } from "./local-files/types";

export interface ToolExtrasProps {
  toolName: string;
  toolCallId?: string;
  result?: string;
  expanded: boolean;
}

export interface LinkProps {
  href: string;
  children: React.ReactNode;
}

export interface AppAdapter {
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
  storageNamespace?: StorageNamespace;
  appVersion?: string;
  appName?: string;
  emptyStateMessage?: string;
  staticFiles?: Record<string, string>;
  customCommands?: () => CustomCommand[];
  hasImageSearch?: boolean;
  getMentionableItems?: () => Promise<MentionItem[]>;
  ToolExtras?: ComponentType<ToolExtrasProps>;
  Link?: ComponentType<LinkProps>;
  SelectionIndicator?: ComponentType;
  SettingsExtra?: ComponentType;
  autoGreeting?: () => Promise<string | null>;
}
