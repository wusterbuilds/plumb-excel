import { Type } from "@sinclair/typebox";
import { getCellRanges, setCellRange } from "../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

interface ScenarioSnapshot {
  scenarioName: string;
  sheetId: number;
  timestamp: number;
  changes: { cell: string; oldValue: unknown; newValue: unknown }[];
  scenarioColumn?: string;
}

const scenarioHistory: ScenarioSnapshot[] = [];

export function getScenarioHistory(): ScenarioSnapshot[] {
  return scenarioHistory;
}

export const applyScenarioTool = defineTool({
  name: "apply_scenario",
  label: "Apply Scenario",
  description:
    "Create a new scenario column in the pro forma with modified assumptions. " +
    "Copies the base case values to a new column, then applies the specified changes. " +
    "All changes are tracked so they can be undone. Adds a header with the scenario name " +
    "and highlights changed cells with a colored border.",
  parameters: Type.Object({
    sheetId: Type.Number({
      description: "The worksheet ID containing the pro forma",
    }),
    scenarioName: Type.String({
      description:
        'Name for this scenario (e.g. "Upside Case", "Conservative")',
    }),
    baseColumn: Type.String({
      description:
        'The column letter containing the base case values (e.g. "B")',
    }),
    targetColumn: Type.String({
      description:
        'The column letter where the scenario will be written (e.g. "C")',
    }),
    changes: Type.Array(
      Type.Object({
        row: Type.Number({ description: "Row number (1-based)" }),
        value: Type.Any({
          description: "The new value or formula for this cell",
        }),
        label: Type.Optional(
          Type.String({ description: "Description of what changed" }),
        ),
      }),
      { description: "Array of cell changes to apply in the scenario column" },
    ),
    headerRow: Type.Optional(
      Type.Number({
        description: "Row number for the scenario header. Default: 1",
        default: 1,
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
    getRanges: (p) => [
      { sheetId: p.sheetId, range: `${p.targetColumn}:${p.targetColumn}` },
    ],
  },
  execute: async (_toolCallId, params) => {
    try {
      const headerRow = params.headerRow ?? 1;

      const allRows = params.changes.map((c) => c.row);
      const minRow = Math.min(...allRows, headerRow);
      const maxRow = Math.max(...allRows);
      const readRange = `${params.baseColumn}${minRow}:${params.baseColumn}${maxRow}`;

      const baseResult = await getCellRanges(params.sheetId, [readRange], {
        includeStyles: false,
        cellLimit: 2000,
      });
      const baseCells = baseResult.worksheet.cells;

      await setCellRange(
        params.sheetId,
        `${params.targetColumn}${headerRow}`,
        [
          [
            {
              value: params.scenarioName,
              cellStyles: { fontWeight: "bold" },
            },
          ],
        ],
        { allowOverwrite: true },
      );

      const snapshot: ScenarioSnapshot = {
        scenarioName: params.scenarioName,
        sheetId: params.sheetId,
        timestamp: Date.now(),
        changes: [],
      };

      for (const change of params.changes) {
        const baseCellRef = `${params.baseColumn}${change.row}`;
        const oldValue = baseCells[baseCellRef] ?? null;

        const isFormula =
          typeof change.value === "string" && change.value.startsWith("=");

        const cell: Record<string, unknown> = {};
        if (isFormula) {
          cell.formula = change.value;
        } else {
          cell.value = change.value;
        }

        cell.borderStyles = {
          left: { style: "solid", weight: "medium", color: "#4A90D9" },
          right: { style: "solid", weight: "medium", color: "#4A90D9" },
          top: { style: "solid", weight: "medium", color: "#4A90D9" },
          bottom: { style: "solid", weight: "medium", color: "#4A90D9" },
        };

        await setCellRange(
          params.sheetId,
          `${params.targetColumn}${change.row}`,
          [[cell as never]],
          { allowOverwrite: true },
        );

        snapshot.changes.push({
          cell: `${params.targetColumn}${change.row}`,
          oldValue,
          newValue: change.value,
        });
      }

      snapshot.scenarioColumn = params.targetColumn;
      scenarioHistory.push(snapshot);

      return toolSuccess({
        scenarioName: params.scenarioName,
        column: params.targetColumn,
        changesApplied: params.changes.length,
        snapshotIndex: scenarioHistory.length - 1,
        changes: snapshot.changes.map((c) => ({
          cell: c.cell,
          oldValue: c.oldValue,
          newValue: c.newValue,
        })),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error applying scenario";
      return toolError(message);
    }
  },
});
