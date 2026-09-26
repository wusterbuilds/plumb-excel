import type { AgentDefinition } from "./types";

type RegistryListener = () => void;

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private activeId = "";
  private listeners = new Set<RegistryListener>();

  register(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
    if (this.agents.size === 1) {
      this.activeId = agent.id;
    }
  }

  setActive(id: string): void {
    if (!this.agents.has(id)) {
      throw new Error(`Agent "${id}" not registered`);
    }
    if (this.activeId === id) return;
    this.activeId = id;
    for (const listener of this.listeners) {
      listener();
    }
  }

  getActive(): AgentDefinition {
    const agent = this.agents.get(this.activeId);
    if (!agent) {
      throw new Error("No active agent registered");
    }
    return agent;
  }

  getActiveId(): string {
    return this.activeId;
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const agentRegistry = new AgentRegistry();
