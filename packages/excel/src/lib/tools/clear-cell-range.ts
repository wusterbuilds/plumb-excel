import { Type } from "@sinclair/typebox";
import { clearCellRange, getCellRanges } from "../excel/api";
import { registerSnapshot, restoreCellSnapshot } from "../snapshot-store";
import { defineTool, toolError, toolSuccess } from "./types";

export const clearCellRangeTool = defineTool({
  name: "clear_cell_range",
  label: "Clear Cell Range",
  description:
    "Clear contents, formatting, or both from a range of cells. " +
    "Use 'contents' to keep formatting, 'formats' to keep values, 'all' to clear everything.",
  parameters: Type.Object({
    sheetId: Type.Number({ description: "The worksheet ID (1-based index)" }),
    range: Type.String({ description: "Range to clear in A1 notation" }),
    clearType: Type.Optional(
      Type.Union(
        [
          Type.Literal("contents"),
          Type.Literal("all"),
          Type.Literal("formats"),
        ],
        {
          description: "What to clear. Default: 'contents'",
        },
      ),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  dirtyTracking: {
    getRanges: (p) => [{ sheetId: p.sheetId, range: p.range }],
  },
  beforeExecute: async (toolCallId, params) => {
    const old = await getCellRanges(params.sheetId, [params.range], {
      includeStyles: false,
      cellLimit: 10000,
    });
    const savedOldCells = { ...old.worksheet.cells };
    const savedOldFormulas = old.worksheet.formulas
      ? { ...old.worksheet.formulas }
      : {};
    const { sheetId, range, clearType } = params;

    registerSnapshot({
      toolCallId,
      toolName: "clear_cell_range",
      timestamp: Date.now(),
      state: "available",
      restore: async () => {
        await restoreCellSnapshot(
          sheetId,
          range,
          savedOldCells,
          savedOldFormulas,
        );
      },
      reapply: async () => {
        await clearCellRange(sheetId, range, clearType);
      },
    });
  },
  execute: async (_toolCallId, params) => {
    try {
      const result = await clearCellRange(
        params.sheetId,
        params.range,
        params.clearType,
      );
      return toolSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error clearing cells";
      return toolError(message);
    }
  },
});
