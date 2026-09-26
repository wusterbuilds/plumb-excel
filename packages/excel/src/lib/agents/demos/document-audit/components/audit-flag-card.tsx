import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquare,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getWorksheetById,
  navigateTo,
  setCellRange,
} from "../../../../excel/api";
import type { AuditFlag, FlagResolution } from "../document-audit-store";
import { documentAuditStore } from "../document-audit-store";

const FLAG_TYPE_LABELS: Record<string, string> = {
  wrong_value: "Wrong Value",
  missing_line_item: "Missing Line Item",
  inconsistent_assumption: "Inconsistent Assumption",
};

const SEVERITY_CONFIG: Record<
  string,
  { label: string; className: string; Icon: typeof AlertCircle }
> = {
  critical: {
    label: "Critical",
    className: "text-red-500 bg-red-500/10",
    Icon: AlertCircle,
  },
  warning: {
    label: "Warning",
    className: "text-amber-500 bg-amber-500/10",
    Icon: AlertTriangle,
  },
};

const RESOLUTION_COLORS: Record<string, string> = {
  accepted: "#27AE60",
  overridden: "#3498DB",
  dismissed: "#95A5A6",
};

async function applyCellBorder(
  sheetId: number,
  cell: string,
  color: string,
): Promise<void> {
  if (sheetId < 0 || !cell) return;
  try {
    await Excel.run(async (context) => {
      const sheet = await getWorksheetById(context, sheetId);
      if (!sheet) return;
      const cellRange = sheet.getRange(cell);
      const sides: { index: Excel.BorderIndex }[] = [
        { index: Excel.BorderIndex.edgeTop },
        { index: Excel.BorderIndex.edgeBottom },
        { index: Excel.BorderIndex.edgeLeft },
        { index: Excel.BorderIndex.edgeRight },
      ];
      for (const { index } of sides) {
        const border = cellRange.format.borders.getItem(index);
        border.style = Excel.BorderLineStyle.continuous;
        border.weight = Excel.BorderWeight.thick;
        border.color = color;
      }
      await context.sync();
    });
  } catch (err) {
    console.error("[AuditFlagCard] Border update failed:", err);
  }
}

export function AuditFlagCard({ flag }: { flag: AuditFlag }) {
  const [resolution, setResolution] = useState<FlagResolution>(() =>
    documentAuditStore.getResolution(flag.id),
  );
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<"view" | "override" | "dismiss">("view");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return documentAuditStore.subscribe(() => {
      setResolution(documentAuditStore.getResolution(flag.id));
    });
  }, [flag.id]);

  const handleAccept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (flag.location.sheetId >= 0 && flag.location.cell) {
        const cleanVal = flag.suggestedValue.replace(/[,$%]/g, "").trim();
        const numVal = Number(cleanVal);
        await setCellRange(flag.location.sheetId, flag.location.cell, [
          [{ value: Number.isNaN(numVal) ? cleanVal : numVal }],
        ]);
        await applyCellBorder(
          flag.location.sheetId,
          flag.location.cell,
          RESOLUTION_COLORS.accepted,
        );
      }
      documentAuditStore.resolveFlag(flag.id, {
        status: "accepted",
        appliedValue: flag.suggestedValue,
      });
    } finally {
      setBusy(false);
    }
  }, [flag, busy]);

  const handleAddLineAccept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (flag.location.sheetId >= 0 && flag.location.cell) {
        await Excel.run(async (context) => {
          const sheet = await getWorksheetById(context, flag.location.sheetId);
          if (!sheet) return;
          const targetRange = sheet.getRange(flag.location.cell);
          targetRange.insert(Excel.InsertShiftDirection.down);
          await context.sync();
        });
        const cleanVal = flag.suggestedValue.replace(/[,$%]/g, "").trim();
        const numVal = Number(cleanVal);
        await setCellRange(flag.location.sheetId, flag.location.cell, [
          [{ value: Number.isNaN(numVal) ? cleanVal : numVal }],
        ]);
        await applyCellBorder(
          flag.location.sheetId,
          flag.location.cell,
          RESOLUTION_COLORS.accepted,
        );
      }
      documentAuditStore.resolveFlag(flag.id, {
        status: "accepted",
        appliedValue: flag.suggestedValue,
      });
    } finally {
      setBusy(false);
    }
  }, [flag, busy]);

  const handleOverrideSubmit = useCallback(async () => {
    if (busy || !overrideValue.trim() || !overrideNote.trim()) return;
    setBusy(true);
    try {
      if (flag.location.sheetId >= 0 && flag.location.cell) {
        const trimmed = overrideValue.trim();
        const numVal = Number(trimmed);
        await setCellRange(flag.location.sheetId, flag.location.cell, [
          [{ value: Number.isNaN(numVal) ? trimmed : numVal }],
        ]);
        await applyCellBorder(
          flag.location.sheetId,
          flag.location.cell,
          RESOLUTION_COLORS.overridden,
        );
      }
      documentAuditStore.resolveFlag(flag.id, {
        status: "overridden",
        userValue: overrideValue.trim(),
        note: overrideNote.trim(),
      });
      setMode("view");
    } finally {
      setBusy(false);
    }
  }, [flag, overrideValue, overrideNote, busy]);

  const handleDismissSubmit = useCallback(async () => {
    if (busy || !dismissReason.trim()) return;
    setBusy(true);
    try {
      if (flag.location.sheetId >= 0 && flag.location.cell) {
        await applyCellBorder(
          flag.location.sheetId,
          flag.location.cell,
          RESOLUTION_COLORS.dismissed,
        );
      }
      documentAuditStore.resolveFlag(flag.id, {
        status: "dismissed",
        reason: dismissReason.trim(),
      });
      setMode("view");
    } finally {
      setBusy(false);
    }
  }, [flag, dismissReason, busy]);

  const handleNavigate = useCallback(() => {
    if (flag.location.sheetId >= 0 && flag.location.cell) {
      navigateTo(flag.location.sheetId, flag.location.cell).catch(
        console.error,
      );
    }
  }, [flag.location]);

  const isResolved = resolution.status !== "pending";
  const sevConfig = SEVERITY_CONFIG[flag.severity] || SEVERITY_CONFIG.warning;
  const SevIcon = sevConfig.Icon;

  return (
    <div
      className={`border rounded-lg transition-colors ${
        isResolved
          ? "border-(--chat-border) opacity-75"
          : "border-(--chat-border)"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-(--chat-bg-secondary) transition-colors"
      >
        <span
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${sevConfig.className}`}
        >
          <SevIcon size={10} />
          {sevConfig.label}
        </span>
        <span className="text-[10px] text-(--chat-text-muted) uppercase">
          {FLAG_TYPE_LABELS[flag.flagType] || flag.flagType}
        </span>
        <span className="flex-1" />
        {isResolved && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              resolution.status === "accepted"
                ? "text-green-500 bg-green-500/10"
                : resolution.status === "overridden"
                  ? "text-blue-400 bg-blue-400/10"
                  : "text-gray-400 bg-gray-400/10"
            }`}
          >
            {resolution.status === "accepted"
              ? "Accepted"
              : resolution.status === "overridden"
                ? "Overridden"
                : "Dismissed"}
          </span>
        )}
        {expanded ? (
          <ChevronUp size={12} className="text-(--chat-text-muted)" />
        ) : (
          <ChevronDown size={12} className="text-(--chat-text-muted)" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleNavigate}
            className="text-[11px] text-(--chat-accent) hover:underline text-left cursor-pointer"
          >
            {flag.location.sheetName} &gt; {flag.location.rowLabel}
            {flag.location.cell ? ` (${flag.location.cell})` : ""}
          </button>

          <div className="flex items-center gap-3 text-[11px]">
            <div>
              <span className="text-(--chat-text-muted)">Current: </span>
              <span className="font-mono text-(--chat-text-primary) font-medium">
                {flag.currentValue}
              </span>
            </div>
            {flag.flagType !== "missing_line_item" && (
              <div>
                <span className="text-(--chat-text-muted)">Suggested: </span>
                <span className="font-mono text-green-500 font-medium">
                  {flag.suggestedValue}
                </span>
              </div>
            )}
            {flag.flagType === "missing_line_item" && (
              <div>
                <span className="text-(--chat-text-muted)">Add: </span>
                <span className="font-mono text-green-500 font-medium">
                  {flag.suggestedValue}
                </span>
              </div>
            )}
          </div>

          <div className="bg-(--chat-bg-secondary) rounded p-2 flex gap-2">
            <FileText
              size={12}
              className="text-(--chat-text-muted) shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-(--chat-accent) font-medium">
                {flag.evidence.documentName}
                {flag.evidence.page ? ` (p. ${flag.evidence.page})` : ""}
              </div>
              <p className="text-[10px] text-(--chat-text-muted) italic mt-0.5 leading-relaxed">
                &ldquo;{flag.evidence.quotedText}&rdquo;
              </p>
            </div>
          </div>

          <p className="text-[10px] text-(--chat-text-muted)">
            {flag.estimatedImpact}
          </p>

          {!isResolved && mode === "view" && (
            <div className="flex items-center gap-1.5 pt-1">
              {flag.flagType === "missing_line_item" ? (
                <button
                  type="button"
                  onClick={handleAddLineAccept}
                  disabled={busy}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus size={10} />
                  Add Line & Accept
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={busy}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check size={10} />
                  Accept
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode("override")}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <MessageSquare size={10} />
                Override
              </button>
              <button
                type="button"
                onClick={() => setMode("dismiss")}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-gray-400/10 text-gray-400 hover:bg-gray-400/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X size={10} />
                Dismiss
              </button>
            </div>
          )}

          {!isResolved && mode === "override" && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-(--chat-border)">
              <label
                htmlFor={`${flag.id}-override-value`}
                className="text-[10px] text-(--chat-text-muted)"
              >
                Your value:
              </label>
              <input
                id={`${flag.id}-override-value`}
                type="text"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="Enter value..."
                className="px-2 py-1 text-[11px] border border-(--chat-border) rounded bg-(--chat-bg) text-(--chat-text-primary) focus:outline-none focus:border-(--chat-accent)"
              />
              <label
                htmlFor={`${flag.id}-override-note`}
                className="text-[10px] text-(--chat-text-muted)"
              >
                Reason (required):
              </label>
              <textarea
                id={`${flag.id}-override-note`}
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="Explain the deviation..."
                rows={2}
                className="px-2 py-1 text-[11px] border border-(--chat-border) rounded bg-(--chat-bg) text-(--chat-text-primary) focus:outline-none focus:border-(--chat-accent) resize-none"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleOverrideSubmit}
                  disabled={
                    busy || !overrideValue.trim() || !overrideNote.trim()
                  }
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-400 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className="px-2 py-1 text-[10px] rounded text-(--chat-text-muted) hover:bg-(--chat-bg-secondary) transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!isResolved && mode === "dismiss" && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-(--chat-border)">
              <label
                htmlFor={`${flag.id}-dismiss-reason`}
                className="text-[10px] text-(--chat-text-muted)"
              >
                Reason for dismissal (required):
              </label>
              <textarea
                id={`${flag.id}-dismiss-reason`}
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Explain why this flag is not actionable..."
                rows={2}
                className="px-2 py-1 text-[11px] border border-(--chat-border) rounded bg-(--chat-bg) text-(--chat-text-primary) focus:outline-none focus:border-(--chat-accent) resize-none"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleDismissSubmit}
                  disabled={busy || !dismissReason.trim()}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-gray-500 text-white hover:bg-gray-600 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Confirm Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className="px-2 py-1 text-[10px] rounded text-(--chat-text-muted) hover:bg-(--chat-bg-secondary) transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isResolved && resolution.status === "overridden" && (
            <div className="text-[10px] text-blue-400 pt-1 border-t border-(--chat-border)">
              <span className="font-medium">Overridden to:</span>{" "}
              {resolution.userValue}
              <br />
              <span className="font-medium">Note:</span> {resolution.note}
            </div>
          )}

          {isResolved && resolution.status === "dismissed" && (
            <div className="text-[10px] text-gray-400 pt-1 border-t border-(--chat-border)">
              <span className="font-medium">Dismissed:</span>{" "}
              {resolution.reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
