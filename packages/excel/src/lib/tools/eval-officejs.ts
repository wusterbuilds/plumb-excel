import {
  readFile,
  readFileBuffer,
  sandboxedEval,
  writeFile,
} from "@office-agents/core";
import { Type } from "@sinclair/typebox";
import type { DirtyRange } from "../dirty-tracker";
import { getCellRanges, getWorkbookMetadata } from "../excel/api";
import { createTrackedContext } from "../excel/tracked-context";
import {
  hasSnapshot,
  registerSnapshot,
  restoreCellSnapshot,
} from "../snapshot-store";
import { defineTool, toolError, toolSuccess } from "./types";

/* global Excel */

const MUTATION_PATTERNS = [
  /\.(values|formulas|numberFormat)\s*=/,
  /\.clear\s*\(/,
  /\.delete\s*\(/,
  /\.insert\s*\(/,
  /\.copyFrom\s*\(/,
  /\.add\s*\(/,
];

function looksLikeMutation(code: string): boolean {
  return MUTATION_PATTERNS.some((p) => p.test(code));
}

interface SheetSnapshot {
  sheetId: number;
  rangeAddr: string;
  cells: Record<string, string | number | boolean | null>;
  formulas: Record<string, string>;
}

async function snapshotAllSheets(): Promise<SheetSnapshot[]> {
  const meta = await getWorkbookMetadata();
  const snapshots: SheetSnapshot[] = [];

  for (const sheet of meta.sheetsMetadata) {
    if (sheet.maxRows === 0 || sheet.maxColumns === 0) continue;
    const maxCol = Math.min(sheet.maxColumns, 50);
    const maxRow = Math.min(sheet.maxRows, 500);
    const colLetter = String.fromCharCode(64 + maxCol);
    const rangeAddr = `A1:${colLetter}${maxRow}`;

    try {
      const data = await getCellRanges(sheet.id, [rangeAddr], {
        includeStyles: false,
        cellLimit: 50000,
      });
      snapshots.push({
        sheetId: sheet.id,
        rangeAddr,
        cells: { ...data.worksheet.cells },
        formulas: data.worksheet.formulas ? { ...data.worksheet.formulas } : {},
      });
    } catch {
      // Skip sheets that can't be read
    }
  }

  return snapshots;
}

export const evalOfficeJsTool = defineTool({
  name: "eval_officejs",
  label: "Execute Office.js Code",
  description:
    "Execute arbitrary Office.js code within an Excel.run context. " +
    "Use this as an escape hatch when existing tools don't cover your use case. " +
    "The code runs inside `Excel.run(async (context) => { ... })` with `context` available. " +
    "Return a value to get it back as the result. Always call `await context.sync()` before returning.",
  parameters: Type.Object({
    code: Type.String({
      description:
        "JavaScript code to execute. Has access to `context` (Excel.RequestContext), " +
        "readFile(path) returns Promise<string>, readFileBuffer(path) returns Promise<Uint8Array>, " +
        "and writeFile(path, content) returns Promise<void> (content: string | Uint8Array) for VFS files. " +
        "Must be valid async code. Return a value to get it as result. " +
        "Example: `const range = context.workbook.worksheets.getActiveWorksheet().getRange('A1'); range.load('values'); await context.sync(); return range.values;`",
    }),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation of what this code does (max 100 chars)",
        maxLength: 100,
      }),
    ),
  }),
  execute: async (toolCallId, params) => {
    try {
      // Snapshot all sheets before execution if code looks like it mutates
      let preSnapshots: SheetSnapshot[] = [];
      if (looksLikeMutation(params.code)) {
        try {
          preSnapshots = await snapshotAllSheets();
        } catch {
          // Snapshot failure should not block execution
        }
      }

      let dirtyRanges: DirtyRange[] = [];

      const result = await Excel.run(async (context) => {
        const { trackedContext, getDirtyRanges } =
          createTrackedContext(context);

        const execResult = await sandboxedEval(params.code, {
          context: trackedContext,
          Excel,
          readFile,
          readFileBuffer,
          writeFile,
        });

        dirtyRanges = getDirtyRanges();
        return execResult;
      });

      if (dirtyRanges.length === 0 && looksLikeMutation(params.code)) {
        dirtyRanges = [{ sheetId: -1, range: "*" }];
      }

      if (preSnapshots.length > 0 && dirtyRanges.length > 0) {
        const dirtySheetIds = new Set(dirtyRanges.map((r) => r.sheetId));
        const relevantSnapshots = dirtySheetIds.has(-1)
          ? preSnapshots
          : preSnapshots.filter((s) => dirtySheetIds.has(s.sheetId));

        if (relevantSnapshots.length > 0) {
          let postSnapshots: SheetSnapshot[] = [];

          registerSnapshot({
            toolCallId,
            toolName: "eval_officejs",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              try {
                postSnapshots = [];
                for (const snap of relevantSnapshots) {
                  const current = await getCellRanges(
                    snap.sheetId,
                    [snap.rangeAddr],
                    { includeStyles: false, cellLimit: 50000 },
                  );
                  postSnapshots.push({
                    sheetId: snap.sheetId,
                    rangeAddr: snap.rangeAddr,
                    cells: { ...current.worksheet.cells },
                    formulas: current.worksheet.formulas
                      ? { ...current.worksheet.formulas }
                      : {},
                  });
                }
              } catch {
                // Best-effort capture for redo
              }
              for (const snap of relevantSnapshots) {
                await restoreCellSnapshot(
                  snap.sheetId,
                  snap.rangeAddr,
                  snap.cells,
                  snap.formulas,
                );
              }
            },
            reapply: async () => {
              for (const snap of postSnapshots) {
                await restoreCellSnapshot(
                  snap.sheetId,
                  snap.rangeAddr,
                  snap.cells,
                  snap.formulas,
                );
              }
            },
          });
        }
      }

      const response: Record<string, unknown> = {
        success: true,
        result: result ?? null,
      };
      if (dirtyRanges.length > 0) {
        response._dirtyRanges = dirtyRanges;
      }
      if (hasSnapshot(toolCallId)) {
        response._hasSnapshot = true;
      }
      return toolSuccess(response);
    } catch (error) {
      if (error instanceof OfficeExtension.Error) {
        const parts = [error.message];
        if (error.code) parts.push(`Code: ${error.code}`);
        if (error.debugInfo) {
          const { errorLocation, statement, surroundingStatements } =
            error.debugInfo;
          if (errorLocation) parts.push(`Location: ${errorLocation}`);
          if (statement) parts.push(`Statement: ${statement}`);
          if (surroundingStatements?.length)
            parts.push(`Context: ${surroundingStatements.join("; ")}`);
        }
        return toolError(parts.join("\n"));
      }
      const message =
        error instanceof Error ? error.message : "Unknown error executing code";
      return toolError(message);
    }
  },
});
