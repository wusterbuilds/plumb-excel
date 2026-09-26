import type {
  AppAdapter,
  LinkProps,
  MentionItem,
  ToolExtrasProps,
} from "@office-agents/core";
import { getOrCreateDocumentId, useChat } from "@office-agents/core";
import { Check, Edit3, Redo2, Undo2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { demoRegistry } from "./agents/demos/demo-registry";
import { AuditReport } from "./agents/proforma-review/components/audit-report";
import { ChangeSummary } from "./agents/proforma-review/components/change-summary";
import { DeepAuditReport } from "./agents/proforma-review/components/deep-audit-report";
import { ScenarioPreview } from "./agents/proforma-review/components/scenario-preview";
import { agentRegistry } from "./agents/registry";
import type { DataSourceInfo } from "./agents/types";
import { ConnectDataTab } from "./cloud/connect-tab";
import { MOCK_CONNECTORS } from "./cloud/mock-catalog";
import type { ConnectedSource } from "./cloud/types";
import { SelectionIndicator } from "./components/selection-indicator";
import { type DirtyRange, mergeRanges } from "./dirty-tracker";
import excelApiDts from "./docs/excel-officejs-api.d.ts?raw";
import { getRangeAsCsv, getWorkbookMetadata, navigateTo } from "./excel/api";
import {
  discardSnapshot,
  getSnapshotState,
  reapplySnapshot,
  restoreSnapshot,
  type SnapshotState,
} from "./snapshot-store";
import { EXCEL_TOOLS } from "./tools";
import { getCustomCommands } from "./vfs/custom-commands";

const CONNECTED_SOURCES_KEY = "plumb-connected-sources";

function loadConnectedDataSources(): DataSourceInfo[] {
  try {
    const raw = localStorage.getItem(CONNECTED_SOURCES_KEY);
    if (!raw) return [];
    const sources: ConnectedSource[] = JSON.parse(raw);
    return sources
      .filter((s) => s.enabled)
      .map((s) => {
        const connector = MOCK_CONNECTORS.find((c) => c.id === s.connectorId);
        return {
          id: s.connectorId,
          name: connector?.name ?? s.displayName,
          type: s.connectorId,
          description: connector?.description ?? "",
          connected: true,
        };
      });
  } catch {
    return [];
  }
}

function parseDirtyRanges(result: string | undefined): DirtyRange[] | null {
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    if (parsed._dirtyRanges && Array.isArray(parsed._dirtyRanges)) {
      return parsed._dirtyRanges;
    }
  } catch {
    // Not valid JSON or no dirty ranges
  }
  return null;
}

function parseCitationUri(
  href: string,
): { sheetId: number; range?: string } | null {
  if (!href.startsWith("#cite:")) return null;
  const path = href.slice("#cite:".length);
  const bangIdx = path.indexOf("!");
  if (bangIdx === -1) {
    const sheetId = Number.parseInt(path, 10);
    return Number.isNaN(sheetId) ? null : { sheetId };
  }
  const sheetId = Number.parseInt(path.slice(0, bangIdx), 10);
  const range = path.slice(bangIdx + 1);
  return Number.isNaN(sheetId) ? null : { sheetId, range };
}

export function createPlumbAdapter(): AppAdapter {
  const activeAgent = agentRegistry.getActive();
  const mergedTools = [...EXCEL_TOOLS, ...activeAgent.tools];

  return {
    tools: mergedTools,
    readOnlyToolNames: [
      "read",
      "bash",
      "get_cell_ranges",
      "get_range_as_csv",
      "search_data",
      "screenshot_range",
      "get_all_objects",
      "read_proforma",
      "audit_proforma",
      "search_local_proformas",
      "search_market_data",
      "query_external_database",
      "compile_deep_audit",
    ],
    customCommands: getCustomCommands,
    staticFiles: {
      "/home/user/docs/excel-officejs-api.d.ts": excelApiDts,
    },

    appName: "Plumb",
    metadataTag: "wb_context",
    storageNamespace: {
      dbName: "PlumbDB",
      dbVersion: 1,
      localStoragePrefix: "plumb",
      documentSettingsPrefix: "plumb",
      documentIdSettingsKey: "plumb-workbook-id",
    },
    appVersion: __APP_VERSION__,
    emptyStateMessage: "Start a conversation to review your pro forma",
    SelectionIndicator,
    buildSystemPrompt: (skills) =>
      activeAgent.buildSystemPrompt(skills, loadConnectedDataSources()),

    getDocumentId: async () => {
      return getOrCreateDocumentId();
    },

    getDocumentMetadata: async () => {
      try {
        const metadata = await getWorkbookMetadata();
        const nameMap: Record<number, string> = {};
        if (metadata.sheetsMetadata) {
          for (const sheet of metadata.sheetsMetadata) {
            nameMap[sheet.id] = sheet.name;
          }
        }
        return { metadata, nameMap };
      } catch {
        return null;
      }
    },

    onToolResult: (_toolCallId, result, isError) => {
      if (isError) return;
      const dirtyRanges = parseDirtyRanges(result);
      if (dirtyRanges && dirtyRanges.length > 0) {
        const first = dirtyRanges[0];
        if (first.sheetId >= 0 && first.range !== "*") {
          navigateTo(first.sheetId, first.range).catch(console.error);
        } else if (first.sheetId >= 0) {
          navigateTo(first.sheetId).catch(console.error);
        }
      }
    },

    getMentionableItems: async (): Promise<MentionItem[]> => {
      try {
        const meta = await getWorkbookMetadata();
        return meta.sheetsMetadata.map(
          (sheet): MentionItem => ({
            id: `sheet:${sheet.id}`,
            label: sheet.name,
            category: "Sheets",
            resolveContent: async () => {
              const maxCol = Math.min(sheet.maxColumns, 26);
              const maxRow = Math.min(sheet.maxRows, 200);
              if (maxRow === 0 || maxCol === 0) return "(empty sheet)";
              const colLetter = String.fromCharCode(64 + maxCol);
              const range = `A1:${colLetter}${maxRow}`;
              const result = await getRangeAsCsv(sheet.id, range);
              return result.csv;
            },
          }),
        );
      } catch {
        return [];
      }
    },

    Link: CitationLink,
    ToolExtras: PlumbToolExtras,
    SettingsExtra: ConnectDataTab,

    autoGreeting: async () => {
      const active = demoRegistry.getActive();
      if (!active || !active.scenario.getGreeting) return null;
      return active.scenario.getGreeting();
    },
  };
}

function CitationLink({ href, children }: LinkProps) {
  const citation = parseCitationUri(href);

  if (citation) {
    return (
      <button
        type="button"
        className="text-(--chat-accent) hover:underline cursor-pointer"
        onClick={() =>
          navigateTo(citation.sheetId, citation.range).catch(console.error)
        }
      >
        {children}
      </button>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const PROFORMA_TOOL_COMPONENTS: Record<
  string,
  React.ComponentType<{ result: string; expanded: boolean }>
> = {
  audit_proforma: AuditReport,
  apply_scenario: ScenarioPreview,
  undo_scenario: ChangeSummary,
  compile_deep_audit: DeepAuditReport,
};

function parseHasSnapshot(result: string | undefined): boolean {
  if (!result) return false;
  try {
    const parsed = JSON.parse(result);
    return parsed._hasSnapshot === true;
  } catch {
    return false;
  }
}

function PlumbToolExtras({
  toolName,
  toolCallId,
  result,
  expanded,
}: ToolExtrasProps) {
  const ProformaComponent = PROFORMA_TOOL_COMPONENTS[toolName];
  if (ProformaComponent && result) {
    return <ProformaComponent result={result} expanded={expanded} />;
  }

  const activeDemo = demoRegistry.getActive();
  if (activeDemo?.scenario.getToolComponents) {
    const demoComponents = activeDemo.scenario.getToolComponents();
    const DemoComponent = demoComponents[toolName];
    if (DemoComponent && result) {
      return <DemoComponent result={result} expanded={expanded} />;
    }
  }

  const showSnapshot = parseHasSnapshot(result) && toolCallId;

  return (
    <>
      <DirtyRangeExtras
        toolName={toolName}
        toolCallId={toolCallId}
        result={result}
        expanded={expanded}
      />
      {showSnapshot && (
        <SnapshotActions toolCallId={toolCallId} expanded={expanded} />
      )}
    </>
  );
}

function SnapshotActions({
  toolCallId,
  expanded,
}: {
  toolCallId: string;
  expanded: boolean;
}) {
  const [state, setState] = useState<SnapshotState | null>(() =>
    getSnapshotState(toolCallId),
  );
  const [busy, setBusy] = useState(false);

  const handleUndo = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (busy) return;
      setBusy(true);
      try {
        await restoreSnapshot(toolCallId);
        setState("undone");
      } finally {
        setBusy(false);
      }
    },
    [toolCallId, busy],
  );

  const handleKeep = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      discardSnapshot(toolCallId);
      setState("kept");
    },
    [toolCallId],
  );

  const handleRedo = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (busy) return;
      setBusy(true);
      try {
        await reapplySnapshot(toolCallId);
        setState("available");
      } finally {
        setBusy(false);
      }
    },
    [toolCallId, busy],
  );

  if (state === "kept" || state === null) return null;

  if (!expanded) {
    if (state === "undone") {
      return (
        <span className="flex items-center gap-1 text-[10px] text-(--chat-text-muted) shrink-0">
          <Undo2 size={9} />
          undone
        </span>
      );
    }
    return (
      <span className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={handleUndo}
          disabled={busy}
          className="p-0.5 rounded hover:bg-(--chat-bg-secondary) text-(--chat-warning) cursor-pointer disabled:opacity-50"
          title="Undo changes"
        >
          <Undo2 size={10} />
        </button>
        <button
          type="button"
          onClick={handleKeep}
          className="p-0.5 rounded hover:bg-(--chat-bg-secondary) text-green-500 cursor-pointer"
          title="Keep changes"
        >
          <Check size={10} />
        </button>
      </span>
    );
  }

  if (state === "undone") {
    return (
      <span className="flex items-center gap-1.5 shrink-0">
        <Undo2 size={9} />
        <span>Undone</span>
        <button
          type="button"
          onClick={handleRedo}
          disabled={busy}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-(--chat-bg) text-(--chat-accent) hover:bg-(--chat-bg-secondary) cursor-pointer border border-(--chat-border) disabled:opacity-50"
        >
          <Redo2 size={9} />
          Redo
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 shrink-0 ml-auto">
      <button
        type="button"
        onClick={handleUndo}
        disabled={busy}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-(--chat-bg) text-(--chat-warning) hover:bg-(--chat-bg-secondary) cursor-pointer border border-(--chat-border) disabled:opacity-50"
      >
        <Undo2 size={9} />
        Undo
      </button>
      <button
        type="button"
        onClick={handleKeep}
        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-(--chat-bg) text-green-500 hover:bg-(--chat-bg-secondary) cursor-pointer border border-(--chat-border)"
      >
        <Check size={9} />
        Keep
      </button>
    </span>
  );
}

function DirtyRangeExtras({ result, expanded }: ToolExtrasProps) {
  const { getName } = useChat();
  const ranges = useMemo(() => parseDirtyRanges(result), [result]);
  const merged = useMemo(() => (ranges ? mergeRanges(ranges) : []), [ranges]);
  const valid = useMemo(
    () => merged.filter((r) => r.sheetId < 0 || getName(r.sheetId)),
    [merged, getName],
  );

  if (valid.length === 0) return null;

  if (expanded) {
    return (
      <>
        <Edit3 size={9} className="shrink-0" />
        <span className="shrink-0">Modified:</span>
        {valid.map((r, i) => (
          <span key={`${r.sheetId}-${r.range}`}>
            {i > 0 && <span className="text-(--chat-warning-muted)">, </span>}
            <DirtyRangeLink range={r} />
          </span>
        ))}
      </>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-(--chat-warning) shrink-0">
      <Edit3 size={9} />
      <DirtyRangeSummary ranges={valid} />
    </span>
  );
}

function DirtyRangeLink({ range }: { range: DirtyRange }) {
  const { getName } = useChat();
  const sheetName = getName(range.sheetId);

  if (range.sheetId < 0) {
    const label =
      range.range === "*" ? "Unknown sheet" : `Unknown!${range.range}`;
    return <span className="text-(--chat-warning-muted)">{label}</span>;
  }

  if (!sheetName) return null;

  const label =
    range.range === "*" ? `${sheetName} (all)` : `${sheetName}!${range.range}`;

  return (
    <button
      type="button"
      className="text-(--chat-warning) hover:underline cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        const navRange = range.range === "*" ? undefined : range.range;
        navigateTo(range.sheetId, navRange).catch(console.error);
      }}
    >
      {label}
    </button>
  );
}

function DirtyRangeSummary({ ranges }: { ranges: DirtyRange[] }) {
  const { getName } = useChat();

  if (ranges.length === 1) {
    const r = ranges[0];
    if (r.sheetId < 0) {
      const brief = r.range === "*" ? "unknown" : r.range;
      return (
        <span className="text-[10px] text-(--chat-warning) truncate">
          → {brief}
        </span>
      );
    }
    const sheetName = getName(r.sheetId);
    if (!sheetName) return null;
    const brief = r.range === "*" ? sheetName : r.range;
    return (
      <span className="text-[10px] text-(--chat-warning) truncate">
        → {brief}
      </span>
    );
  }

  return (
    <span className="text-[10px] text-(--chat-warning)">
      → {ranges.length} ranges
    </span>
  );
}
