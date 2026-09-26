export type SourceRef =
  | { type: "local_file"; path: string; section?: string; displayName: string }
  | { type: "web_url"; url: string; section?: string; displayName: string }
  | {
      type: "database";
      database: string;
      queryId: string;
      displayName: string;
    };

export interface AuditCellData {
  targetRange: string;
  targetLabel: string;
  targetValue: string;
  verdict: string;
  verdictExplanation: string;
  sources: Array<{
    sourceLabel: string;
    sourceRef: SourceRef;
    summary: string;
  }>;
  timestamp: number;
}

type RegistryListener = () => void;

const auditCellRegistry = new Map<string, AuditCellData>();
const listeners = new Set<RegistryListener>();

function normalizeKey(key: string): string {
  return key.replace(/\s+/g, "").toUpperCase();
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function registerAuditCell(key: string, data: AuditCellData): void {
  auditCellRegistry.set(normalizeKey(key), data);
  notify();
}

export function lookupAuditCell(key: string): AuditCellData | undefined {
  return auditCellRegistry.get(normalizeKey(key));
}

export function clearAuditCells(): void {
  auditCellRegistry.clear();
  notify();
}

export function subscribeAuditCells(listener: RegistryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
