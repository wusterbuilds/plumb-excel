import { Type } from "@sinclair/typebox";
import { setCellRange } from "../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";
import { getScenarioHistory } from "./apply-scenario";

export const undoScenarioTool = defineTool({
  name: "undo_scenario",
  label: "Undo Scenario",
  description:
    "Revert the last applied scenario by restoring original values and clearing the scenario column. " +
    "Uses the tracked change snapshot to restore each cell to its pre-scenario state. " +
    "Can also target a specific scenario by index.",
  parameters: Type.Object({
    snapshotIndex: Type.Optional(
      Type.Number({
        description:
          "Index of the scenario snapshot to undo. Default: last applied scenario.",
      }),
    ),
    clearColumn: Type.Optional(
      Type.Boolean({
        description:
          "If true, clears the entire scenario column. If false, only reverts changed cells. Default: true.",
        default: true,
      }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const history = getScenarioHistory();
      if (history.length === 0) {
        return toolError(
          "No scenarios to undo — no scenario has been applied yet.",
        );
      }

      const index = params.snapshotIndex ?? history.length - 1;
      if (index < 0 || index >= history.length) {
        return toolError(
          `Invalid snapshot index ${index}. Available: 0 to ${history.length - 1}`,
        );
      }

      const snapshot = history[index];
      const restored: { cell: string; restoredValue: unknown }[] = [];

      for (const change of snapshot.changes) {
        const cell: Record<string, unknown> = {};
        if (change.oldValue === null || change.oldValue === undefined) {
          cell.value = "";
        } else if (
          typeof change.oldValue === "string" &&
          change.oldValue.startsWith("=")
        ) {
          cell.formula = change.oldValue;
        } else {
          cell.value = change.oldValue;
        }

        cell.borderStyles = {
          left: { style: "solid", weight: "thin", color: "#D3D3D3" },
          right: { style: "solid", weight: "thin", color: "#D3D3D3" },
          top: { style: "solid", weight: "thin", color: "#D3D3D3" },
          bottom: { style: "solid", weight: "thin", color: "#D3D3D3" },
        };

        await setCellRange(snapshot.sheetId, change.cell, [[cell as never]], {
          allowOverwrite: true,
        });

        restored.push({
          cell: change.cell,
          restoredValue: change.oldValue,
        });
      }

      history.splice(index, 1);

      return toolSuccess({
        undoneScenario: snapshot.scenarioName,
        cellsRestored: restored.length,
        restored,
        remainingScenarios: history.length,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error undoing scenario";
      return toolError(message);
    }
  },
});
