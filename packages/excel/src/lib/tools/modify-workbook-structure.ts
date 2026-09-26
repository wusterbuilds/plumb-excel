import { Type } from "@sinclair/typebox";
import {
  getCellRanges,
  getWorkbookMetadata,
  getWorksheetById,
  modifyWorkbookStructure,
  setCellRange,
} from "../excel/api";
import { registerSnapshot } from "../snapshot-store";
import { defineTool, toolError, toolSuccess } from "./types";

/* global Excel */

export const modifyWorkbookStructureTool = defineTool({
  name: "modify_workbook_structure",
  label: "Modify Workbook Structure",
  description:
    "Create, delete, rename, or duplicate worksheets. " +
    "Use this to manage sheets in the workbook.",
  parameters: Type.Object({
    operation: Type.Union(
      [
        Type.Literal("create"),
        Type.Literal("delete"),
        Type.Literal("rename"),
        Type.Literal("duplicate"),
      ],
      { description: "Operation to perform" },
    ),
    sheetId: Type.Optional(
      Type.Number({ description: "Sheet ID for delete/rename/duplicate" }),
    ),
    sheetName: Type.Optional(
      Type.String({ description: "Name for new sheet (create)" }),
    ),
    newName: Type.Optional(
      Type.String({
        description: "New name (rename) or name for copy (duplicate)",
      }),
    ),
    tabColor: Type.Optional(
      Type.String({ description: "Tab color as hex, e.g. '#ff0000'" }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  dirtyTracking: {
    getRanges: (p, result) => {
      if (p.operation === "create" || p.operation === "duplicate") {
        const r = result as { sheetId?: number };
        return r?.sheetId ? [{ sheetId: r.sheetId, range: "*" }] : [];
      }
      return p.sheetId ? [{ sheetId: p.sheetId, range: "*" }] : [];
    },
  },
  beforeExecute: async (toolCallId, params) => {
    const { operation, sheetId } = params;

    switch (operation) {
      case "create": {
        // Undo for create: we need the new sheet ID from the result.
        // We register a placeholder and patch it in execute via afterCreate.
        // Instead, we register after execute using a deferred approach.
        // For create/duplicate, snapshot is registered post-execute (see execute).
        break;
      }
      case "delete": {
        if (!sheetId) break;
        const oldName = await Excel.run(async (context) => {
          const sheet = await getWorksheetById(context, sheetId);
          if (!sheet) return null;
          sheet.load("name");
          await context.sync();
          return sheet.name;
        });
        if (!oldName) break;

        const meta = await getWorkbookMetadata();
        const sheetMeta = meta.sheetsMetadata.find((s) => s.id === sheetId);
        if (
          !sheetMeta ||
          sheetMeta.maxRows === 0 ||
          sheetMeta.maxColumns === 0
        ) {
          registerSnapshot({
            toolCallId,
            toolName: "modify_workbook_structure",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              await modifyWorkbookStructure({
                operation: "create",
                sheetName: oldName,
              });
            },
            reapply: async () => {
              await modifyWorkbookStructure({
                operation: "delete",
                sheetId,
              });
            },
          });
          break;
        }

        const maxCol = Math.min(sheetMeta.maxColumns, 100);
        const colLetter = String.fromCharCode(64 + maxCol);
        const rangeAddr = `A1:${colLetter}${sheetMeta.maxRows}`;

        const old = await getCellRanges(sheetId, [rangeAddr], {
          includeStyles: false,
          cellLimit: 100000,
        });
        const savedCells = { ...old.worksheet.cells };
        const savedFormulas = old.worksheet.formulas
          ? { ...old.worksheet.formulas }
          : {};

        let restoredSheetId: number | null = null;

        registerSnapshot({
          toolCallId,
          toolName: "modify_workbook_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            const createResult = await modifyWorkbookStructure({
              operation: "create",
              sheetName: oldName,
            });
            restoredSheetId =
              (createResult as { sheetId?: number }).sheetId ?? null;
            if (restoredSheetId && Object.keys(savedCells).length > 0) {
              const rows: Record<string, unknown>[][] = [];
              for (let r = 1; r <= sheetMeta.maxRows; r++) {
                const row: Record<string, unknown>[] = [];
                for (let c = 1; c <= maxCol; c++) {
                  const addr = `${String.fromCharCode(64 + c)}${r}`;
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
              await setCellRange(restoredSheetId, rangeAddr, rows as never, {
                allowOverwrite: true,
              });
            }
          },
          reapply: async () => {
            const targetId = restoredSheetId ?? sheetId;
            await modifyWorkbookStructure({
              operation: "delete",
              sheetId: targetId,
            });
          },
        });
        break;
      }
      case "rename": {
        if (!sheetId) break;
        const oldName = await Excel.run(async (context) => {
          const sheet = await getWorksheetById(context, sheetId);
          if (!sheet) return null;
          sheet.load("name");
          await context.sync();
          return sheet.name;
        });
        if (!oldName) break;

        registerSnapshot({
          toolCallId,
          toolName: "modify_workbook_structure",
          timestamp: Date.now(),
          state: "available",
          restore: async () => {
            await modifyWorkbookStructure({
              operation: "rename",
              sheetId,
              newName: oldName,
            });
          },
          reapply: async () => {
            await modifyWorkbookStructure({
              operation: "rename",
              sheetId,
              newName: params.newName,
            });
          },
        });
        break;
      }
      case "duplicate": {
        break;
      }
    }
  },
  execute: async (toolCallId, params) => {
    try {
      const result = await modifyWorkbookStructure({
        operation: params.operation,
        sheetId: params.sheetId,
        sheetName: params.sheetName,
        newName: params.newName,
        tabColor: params.tabColor,
      });

      if (params.operation === "create" || params.operation === "duplicate") {
        const newSheetId = (result as { sheetId?: number }).sheetId;
        if (newSheetId) {
          registerSnapshot({
            toolCallId,
            toolName: "modify_workbook_structure",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              await modifyWorkbookStructure({
                operation: "delete",
                sheetId: newSheetId,
              });
            },
            reapply: async () => {
              await modifyWorkbookStructure({
                operation: params.operation,
                sheetId: params.sheetId,
                sheetName: params.sheetName,
                newName: params.newName,
                tabColor: params.tabColor,
              });
            },
          });
        }
      }

      return toolSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error modifying workbook";
      return toolError(message);
    }
  },
});
