import { agentRegistry } from "../registry";
import type { DemoScenario } from "./types";

const STORAGE_KEY = "plumb-active-demo";

type RegistryListener = () => void;

interface StoredState {
  id: string;
  hardcoded: boolean;
}

class DemoRegistry {
  private scenarios = new Map<string, DemoScenario>();
  private activeId: string | null = null;
  private hardcodedMode = false;
  private listeners = new Set<RegistryListener>();

  register(scenario: DemoScenario): void {
    this.scenarios.set(scenario.id, scenario);
    agentRegistry.register(scenario.agent);
  }

  activate(id: string, hardcoded: boolean): void {
    const scenario = this.scenarios.get(id);
    if (!scenario) throw new Error(`Demo scenario "${id}" not registered`);

    this.activeId = id;
    this.hardcodedMode = hardcoded;
    agentRegistry.setActive(scenario.agent.id);
    this.persist();
    this.notify();
  }

  deactivate(): void {
    if (!this.activeId) return;
    this.activeId = null;
    this.hardcodedMode = false;
    agentRegistry.setActive("proforma-review");
    localStorage.removeItem(STORAGE_KEY);
    this.notify();
  }

  getActive(): { scenario: DemoScenario; hardcoded: boolean } | null {
    if (!this.activeId) return null;
    const scenario = this.scenarios.get(this.activeId);
    if (!scenario) return null;
    return { scenario, hardcoded: this.hardcodedMode };
  }

  isHardcoded(): boolean {
    return this.hardcodedMode;
  }

  setHardcoded(hardcoded: boolean): void {
    if (!this.activeId) return;
    this.hardcodedMode = hardcoded;
    this.persist();
    this.notify();
  }

  list(): DemoScenario[] {
    return Array.from(this.scenarios.values());
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored: StoredState = JSON.parse(raw);
      if (this.scenarios.has(stored.id)) {
        this.activate(stored.id, stored.hardcoded);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private persist(): void {
    if (this.activeId) {
      const state: StoredState = {
        id: this.activeId,
        hardcoded: this.hardcodedMode,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const demoRegistry = new DemoRegistry();
