import { Type } from "@sinclair/typebox";
import {
  getCellRanges,
  getWorksheetById,
  modifySheetStructure,
} from "../excel/api";
import { registerSnapshot, restoreCellSnapshot } from "../snapshot-store";
import { defineTool, toolError, toolSuccess } from "./types";

/* global Excel */

function columnLetterToIndex(letter: string): number {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
  }
  return col;
}

function columnIndexToLetter(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function getFreezeAddress(sheetId: number): Promise<string | null> {
  return Excel.run(async (context) => {
    const sheet = await getWorksheetById(context, sheetId);
    if (!sheet) return null;
    const loc = sheet.freezePanes.getLocationOrNullObject();
    loc.load("address");
    await context.sync();
    if (loc.isNullObject) return null;
    return loc.address.includes("!") ? loc.address.split("!")[1] : loc.address;
  });
}

export const modifySheetStructureTool = defineTool({
  name: "modify_sheet_structure",
  label: "Modify Sheet Structure",
  description:
    "Insert, delete, hide, or freeze rows and columns. Use reference like '5' for row 5 or 'C' for column C.",
  parameters: Type.Object({
    sheetId: Type.Number({ description: "The worksheet ID (1-based index)" }),
    operation: Type.Union(
      [
        Type.Literal("insert"),
        Type.Literal("delete"),
        Type.Literal("hide"),
        Type.Literal("unhide"),
        Type.Literal("freeze"),
        Type.Literal("unfreeze"),
      ],
      { description: "Operation to perform" },
    ),
    dimension: Type.Union([Type.Literal("rows"), Type.Literal("columns")], {
      description: "Rows or columns (not needed for unfreeze)",
    }),
    reference: Type.Optional(
      Type.String({
        description: "Row number or column letter, e.g. '5' or 'C'",
      }),
    ),
    count: Type.Optional(
      Type.Number({ description: "Number of rows/columns. Default: 1" }),
    ),
    position: Type.Optional(
      Type.Union([Type.Literal("before"), Type.Literal("after")], {
        description: "Insert before or after reference. Default: 'before'",
      }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  dirtyTracking: {
    getRanges: (p) => [{ sheetId: p.sheetId, range: "*" }],
  },
  beforeExecute: async (toolCallId, params) => {
    const {
      sheetId,
      operation,
      dimension,
      reference,
      count = 1,
      position = "before",
    } = params;

    const reapplyOriginal = async () => {
      await modifySheetStructure(sheetId, {
        operation,
        dimension,
        reference,
        count,
        position,
      });
    };

    switch (operation) {
      case "insert": {
        registerSnapshot({
          toolCallId,
          toolName: "modify_sheet_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            await modifySheetStructure(sheetId, {
              operation: "delete",
              dimension,
              reference,
              count,
              position,
            });
          },
          reapply: reapplyOriginal,
        });
        break;
      }
      case "delete": {
        if (!reference) break;
        const isRow = dimension === "rows";
        let rangeAddr: string;
        if (isRow) {
          const startRow = Number.parseInt(reference, 10);
          const endRow = startRow + count - 1;
          rangeAddr = `A${startRow}:ZZ${endRow}`;
        } else {
          const startCol = columnLetterToIndex(reference);
          const endCol = startCol + count - 1;
          rangeAddr = `${reference}1:${columnIndexToLetter(endCol)}10000`;
        }

        const old = await getCellRanges(sheetId, [rangeAddr], {
          includeStyles: false,
          cellLimit: 50000,
        });
        const savedCells = { ...old.worksheet.cells };
        const savedFormulas = old.worksheet.formulas
          ? { ...old.worksheet.formulas }
          : {};

        registerSnapshot({
          toolCallId,
          toolName: "modify_sheet_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            await modifySheetStructure(sheetId, {
              operation: "insert",
              dimension,
              reference,
              count,
            });
            await restoreCellSnapshot(
              sheetId,
              rangeAddr,
              savedCells,
              savedFormulas,
            );
          },
          reapply: reapplyOriginal,
        });
        break;
      }
      case "hide": {
        registerSnapshot({
          toolCallId,
          toolName: "modify_sheet_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            await modifySheetStructure(sheetId, {
              operation: "unhide",
              dimension,
              reference,
              count,
            });
          },
          reapply: reapplyOriginal,
        });
        break;
      }
      case "unhide": {
        registerSnapshot({
          toolCallId,
          toolName: "modify_sheet_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            await modifySheetStructure(sheetId, {
              operation: "hide",
              dimension,
              reference,
              count,
            });
          },
          reapply: reapplyOriginal,
        });
        break;
      }
      case "freeze": {
        const oldFreezeAddr = await getFreezeAddress(sheetId);
        registerSnapshot({
          toolCallId,
          toolName: "modify_sheet_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            if (oldFreezeAddr) {
              await modifySheetStructure(sheetId, {
                operation: "freeze",
                dimension,
                reference: oldFreezeAddr,
              });
            } else {
              await modifySheetStructure(sheetId, {
                operation: "unfreeze",
                dimension,
              });
            }
          },
          reapply: reapplyOriginal,
        });
        break;
      }
      case "unfreeze": {
        const oldFreezeAddr = await getFreezeAddress(sheetId);
        if (oldFreezeAddr) {
          registerSnapshot({
            toolCallId,
            toolName: "modify_sheet_structure",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              await modifySheetStructure(sheetId, {
                operation: "freeze",
                dimension,
                reference: oldFreezeAddr,
              });
            },
            reapply: reapplyOriginal,
          });
        }
        break;
      }
    }
  },
  execute: async (_toolCallId, params) => {
    try {
      const result = await modifySheetStructure(params.sheetId, {
        operation: params.operation,
        dimension: params.dimension,
        reference: params.reference,
        count: params.count,
        position: params.position,
      });
      return toolSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error modifying structure";
      return toolError(message);
    }
  },
});
