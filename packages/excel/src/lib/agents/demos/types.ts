import type { ComponentType } from "react";
import type { AgentDefinition } from "../types";

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  agent: AgentDefinition;
  supportsHardcoded: boolean;
  getGreeting?: () => Promise<string | null>;
  getToolComponents?: () => Record<
    string,
    ComponentType<{ result: string; expanded: boolean }>
  >;
}
