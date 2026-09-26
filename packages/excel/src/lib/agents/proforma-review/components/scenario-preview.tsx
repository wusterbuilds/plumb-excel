import { ArrowRight, GitBranch } from "lucide-react";
import { useMemo } from "react";

interface ScenarioResult {
  scenarioName: string;
  column: string;
  changesApplied: number;
  changes: { cell: string; oldValue: unknown; newValue: unknown }[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

export function ScenarioPreview({
  result,
  expanded,
}: {
  result: string;
  expanded: boolean;
}) {
  const data = useMemo<ScenarioResult | null>(() => {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  if (!data?.scenarioName) return null;

  if (!expanded) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-(--chat-accent) shrink-0">
        <GitBranch size={10} />
        {data.scenarioName} — {data.changesApplied} change
        {data.changesApplied !== 1 ? "s" : ""}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 py-1">
        <GitBranch size={12} className="text-(--chat-accent)" />
        <span className="text-xs font-medium text-(--chat-text-primary)">
          {data.scenarioName}
        </span>
        <span className="text-[10px] text-(--chat-text-muted)">
          Column {data.column}
        </span>
      </div>

      {data.changes && data.changes.length > 0 && (
        <div className="border border-(--chat-border) rounded overflow-hidden">
          <div className="grid grid-cols-[60px_1fr_auto_1fr] gap-x-2 px-2 py-1 text-[10px] text-(--chat-text-muted) bg-(--chat-bg-secondary) border-b border-(--chat-border)">
            <span>Cell</span>
            <span>Old</span>
            <span />
            <span>New</span>
          </div>
          {data.changes.map((change) => (
            <div
              key={change.cell}
              className="grid grid-cols-[60px_1fr_auto_1fr] gap-x-2 px-2 py-1 text-[11px] hover:bg-(--chat-bg-secondary) transition-colors"
            >
              <span className="font-mono text-(--chat-accent)">
                {change.cell}
              </span>
              <span className="text-(--chat-text-muted) truncate">
                {formatValue(change.oldValue)}
              </span>
              <ArrowRight
                size={10}
                className="text-(--chat-text-muted) self-center"
              />
              <span className="text-(--chat-text-primary) font-medium truncate">
                {formatValue(change.newValue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
