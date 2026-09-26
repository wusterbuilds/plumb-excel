import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { SkillMeta } from "@office-agents/core";

export interface DataSourceInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  connected: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tools: AgentTool[];
  buildSystemPrompt: (
    skills: SkillMeta[],
    dataSources: DataSourceInfo[],
  ) => string;
  requiredDataSources?: string[];
}
