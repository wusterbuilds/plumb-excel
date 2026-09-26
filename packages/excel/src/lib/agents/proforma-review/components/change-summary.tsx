import { Undo2 } from "lucide-react";
import { useMemo } from "react";

interface UndoResult {
  undoneScenario: string;
  cellsRestored: number;
  restored: { cell: string; restoredValue: unknown }[];
  remainingScenarios: number;
}

export function ChangeSummary({
  result,
  expanded,
}: {
  result: string;
  expanded: boolean;
}) {
  const data = useMemo<UndoResult | null>(() => {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  if (!data?.undoneScenario) return null;

  if (!expanded) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-(--chat-warning) shrink-0">
        <Undo2 size={10} />
        Undone: {data.undoneScenario} ({data.cellsRestored} cell
        {data.cellsRestored !== 1 ? "s" : ""})
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 py-1">
        <Undo2 size={12} className="text-(--chat-warning)" />
        <span className="text-xs font-medium text-(--chat-text-primary)">
          Reverted: {data.undoneScenario}
        </span>
      </div>

      <div className="text-[11px] text-(--chat-text-secondary)">
        {data.cellsRestored} cell{data.cellsRestored !== 1 ? "s" : ""} restored
        to original values
        {data.remainingScenarios > 0 && (
          <>
            {" "}
            — {data.remainingScenarios} scenario
            {data.remainingScenarios !== 1 ? "s" : ""} remaining
          </>
        )}
      </div>

      {data.restored && data.restored.length > 0 && (
        <div className="border border-(--chat-border) rounded overflow-hidden">
          <div className="grid grid-cols-[80px_1fr] gap-x-2 px-2 py-1 text-[10px] text-(--chat-text-muted) bg-(--chat-bg-secondary) border-b border-(--chat-border)">
            <span>Cell</span>
            <span>Restored Value</span>
          </div>
          {data.restored.map((item) => (
            <div
              key={item.cell}
              className="grid grid-cols-[80px_1fr] gap-x-2 px-2 py-1 text-[11px] hover:bg-(--chat-bg-secondary) transition-colors"
            >
              <span className="font-mono text-(--chat-accent)">
                {item.cell}
              </span>
              <span className="text-(--chat-text-primary) truncate">
                {item.restoredValue === null ? "—" : String(item.restoredValue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
