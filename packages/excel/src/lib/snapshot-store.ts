import { setCellRange } from "./excel/api";

export type SnapshotState = "available" | "undone" | "kept";

export interface ToolSnapshot {
  toolCallId: string;
  toolName: string;
  timestamp: number;
  state: SnapshotState;
  restore: () => Promise<void>;
  reapply?: () => Promise<void>;
}

const snapshots = new Map<string, ToolSnapshot>();

export function registerSnapshot(snapshot: ToolSnapshot): void {
  snapshots.set(snapshot.toolCallId, snapshot);
}

export async function restoreSnapshot(toolCallId: string): Promise<void> {
  const snapshot = snapshots.get(toolCallId);
  if (!snapshot || snapshot.state !== "available") return;
  await snapshot.restore();
  snapshot.state = "undone";
}

export async function reapplySnapshot(toolCallId: string): Promise<void> {
  const snapshot = snapshots.get(toolCallId);
  if (!snapshot || snapshot.state !== "undone" || !snapshot.reapply) return;
  await snapshot.reapply();
  snapshot.state = "available";
}

export function discardSnapshot(toolCallId: string): void {
  const snapshot = snapshots.get(toolCallId);
  if (snapshot) {
    snapshot.state = "kept";
  }
}

export function getSnapshotState(toolCallId: string): SnapshotState | null {
  return snapshots.get(toolCallId)?.state ?? null;
}

export function hasSnapshot(toolCallId: string): boolean {
  return snapshots.has(toolCallId);
}

/**
 * Restore cell values/formulas from a snapshot to a range.
 * Parses the range address to determine the grid dimensions,
 * then writes each cell's old value or formula back.
 */
export async function restoreCellSnapshot(
  sheetId: number,
  rangeAddr: string,
  savedCells: Record<string, string | number | boolean | null>,
  savedFormulas: Record<string, string>,
): Promise<void> {
  const parsed = parseA1Range(rangeAddr);
  if (!parsed) return;

  const rows: Record<string, unknown>[][] = [];
  for (let r = parsed.startRow; r <= parsed.endRow; r++) {
    const row: Record<string, unknown>[] = [];
    for (let c = parsed.startCol; c <= parsed.endCol; c++) {
      const addr = colToLetter(c) + r;
      const formula = savedFormulas[addr];
      const value = savedCells[addr];
      const cell: Record<string, unknown> = {};
      if (formula) {
        cell.formula = formula;
      } else if (value !== undefined) {
        cell.value = value;
      } else {
        cell.value = "";
      }
      row.push(cell);
    }
    rows.push(row);
  }

  if (rows.length > 0) {
    await setCellRange(sheetId, rangeAddr, rows as never, {
      allowOverwrite: true,
    });
  }
}

function parseA1Range(addr: string): {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
} | null {
  const parts = addr.split(":");
  const start = parseCell(parts[0]);
  const end = parts[1] ? parseCell(parts[1]) : start;
  if (!start || !end) return null;
  return {
    startCol: Math.min(start.col, end.col),
    startRow: Math.min(start.row, end.row),
    endCol: Math.max(start.col, end.col),
    endRow: Math.max(start.row, end.row),
  };
}

function parseCell(cell: string): { col: number; row: number } | null {
  const m = cell.match(/^([A-Z]+)(\d+)$/i);
  if (!m) return null;
  const colStr = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return { col, row: Number.parseInt(m[2], 10) };
}

function colToLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
