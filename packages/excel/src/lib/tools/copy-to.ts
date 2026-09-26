import { Type } from "@sinclair/typebox";
import { copyTo, getCellRanges } from "../excel/api";
import { registerSnapshot, restoreCellSnapshot } from "../snapshot-store";
import { defineTool, toolError, toolSuccess } from "./types";

export const copyToTool = defineTool({
  name: "copy_to",
  label: "Copy To",
  description:
    "Copy a range to another location with formula translation. " +
    "If destination is larger, the source pattern repeats. " +
    "Great for filling formulas down a column.",
  parameters: Type.Object({
    sheetId: Type.Number({ description: "The worksheet ID (1-based index)" }),
    sourceRange: Type.String({ description: "Source range in A1 notation" }),
    destinationRange: Type.String({
      description: "Destination range in A1 notation",
    }),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  dirtyTracking: {
    getRanges: (p) => [{ sheetId: p.sheetId, range: p.destinationRange }],
  },
  beforeExecute: async (toolCallId, params) => {
    const old = await getCellRanges(params.sheetId, [params.destinationRange], {
      includeStyles: false,
      cellLimit: 10000,
    });
    const savedOldCells = { ...old.worksheet.cells };
    const savedOldFormulas = old.worksheet.formulas
      ? { ...old.worksheet.formulas }
      : {};
    const { sheetId, destinationRange } = params;

    let savedNewCells: Record<string, string | number | boolean | null> = {};
    let savedNewFormulas: Record<string, string> = {};

    registerSnapshot({
      toolCallId,
      toolName: "copy_to",
      timestamp: Date.now(),
      state: "available",
      restore: async () => {
        const current = await getCellRanges(sheetId, [destinationRange], {
          includeStyles: false,
          cellLimit: 10000,
        });
        savedNewCells = { ...current.worksheet.cells };
        savedNewFormulas = current.worksheet.formulas
          ? { ...current.worksheet.formulas }
          : {};
        await restoreCellSnapshot(
          sheetId,
          destinationRange,
          savedOldCells,
          savedOldFormulas,
        );
      },
      reapply: async () => {
        await restoreCellSnapshot(
          sheetId,
          destinationRange,
          savedNewCells,
          savedNewFormulas,
        );
      },
    });
  },
  execute: async (_toolCallId, params) => {
    try {
      const result = await copyTo(
        params.sheetId,
        params.sourceRange,
        params.destinationRange,
      );
      return toolSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error copying range";
      return toolError(message);
    }
  },
});
