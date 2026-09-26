export interface AuditFlagLocation {
  sheetId: number;
  sheetName: string;
  cell: string;
  rowLabel: string;
}

export interface AuditFlagEvidence {
  documentName: string;
  page?: number;
  quotedText: string;
}

export interface AuditFlag {
  id: string;
  location: AuditFlagLocation;
  flagType: "wrong_value" | "missing_line_item" | "inconsistent_assumption";
  severity: "critical" | "warning";
  currentValue: string;
  evidence: AuditFlagEvidence;
  suggestedValue: string;
  estimatedImpact: string;
}

export type FlagResolution =
  | { status: "pending" }
  | { status: "accepted"; appliedValue: string }
  | { status: "overridden"; userValue: string; note: string }
  | { status: "dismissed"; reason: string };

export interface AuditRunMetadata {
  auditRunId: string;
  timestamp: number;
  documentsAudited: Array<{ name: string; uploadDate?: string }>;
  proformaVersion: string;
  summary: {
    criticalCount: number;
    warningCount: number;
    missingCount: number;
    noiImpact: string;
    valueImpact: string;
  };
}

export interface AuditRunState {
  metadata: AuditRunMetadata;
  flags: AuditFlag[];
  resolutions: Map<string, FlagResolution>;
}

export interface CompletedAuditEntry {
  metadata: AuditRunMetadata;
  flags: AuditFlag[];
  resolutions: Record<
    string,
    { status: string; value?: string; note?: string; reason?: string }
  >;
}

type StoreListener = () => void;

const HISTORY_KEY = "plumb-audit-history-document-audit";

class DocumentAuditStore {
  private activeRun: AuditRunState | null = null;
  private listeners = new Set<StoreListener>();

  setActiveRun(metadata: AuditRunMetadata, flags: AuditFlag[]): void {
    const resolutions = new Map<string, FlagResolution>();
    for (const flag of flags) {
      resolutions.set(flag.id, { status: "pending" });
    }
    this.activeRun = { metadata, flags, resolutions };
    this.notify();
  }

  getActiveRun(): AuditRunState | null {
    return this.activeRun;
  }

  resolveFlag(flagId: string, resolution: FlagResolution): void {
    if (!this.activeRun) return;
    this.activeRun.resolutions.set(flagId, resolution);
    this.notify();

    if (this.isAllResolved()) {
      this.saveToHistory();
    }
  }

  getResolution(flagId: string): FlagResolution {
    return this.activeRun?.resolutions.get(flagId) ?? { status: "pending" };
  }

  isAllResolved(): boolean {
    if (!this.activeRun) return false;
    for (const res of this.activeRun.resolutions.values()) {
      if (res.status === "pending") return false;
    }
    return true;
  }

  getResolutionSummary(): {
    accepted: number;
    overridden: number;
    dismissed: number;
    pending: number;
  } {
    const result = { accepted: 0, overridden: 0, dismissed: 0, pending: 0 };
    if (!this.activeRun) return result;
    for (const res of this.activeRun.resolutions.values()) {
      result[res.status as keyof typeof result]++;
    }
    return result;
  }

  getHistory(): CompletedAuditEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private saveToHistory(): void {
    if (!this.activeRun) return;
    const entry: CompletedAuditEntry = {
      metadata: this.activeRun.metadata,
      flags: this.activeRun.flags,
      resolutions: Object.fromEntries(
        Array.from(this.activeRun.resolutions.entries()).map(([id, res]) => {
          if (res.status === "accepted") {
            return [id, { status: "accepted", value: res.appliedValue }];
          }
          if (res.status === "overridden") {
            return [
              id,
              { status: "overridden", value: res.userValue, note: res.note },
            ];
          }
          if (res.status === "dismissed") {
            return [id, { status: "dismissed", reason: res.reason }];
          }
          return [id, { status: "pending" }];
        }),
      ),
    };

    try {
      const history = this.getHistory();
      history.push(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      console.error("[DocumentAuditStore] Failed to save history:", err);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const documentAuditStore = new DocumentAuditStore();
