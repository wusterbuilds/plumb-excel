import { Type } from "@sinclair/typebox";
import { getCellRanges } from "../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

export const translateProformaTool = defineTool({
  name: "translate_proforma",
  label: "Translate Pro Forma",
  description:
    "Map an uploaded external pro forma to the active spreadsheet's layout. " +
    "Reads the uploaded file (already in VFS from file upload) and the target template, " +
    "then produces a field mapping that shows how source fields correspond to target cells. " +
    "Use this when a user uploads a third-party pro forma and wants to reconcile it with their template.",
  parameters: Type.Object({
    sourceFile: Type.String({
      description:
        "Path to the uploaded pro forma file in VFS (e.g. /home/user/uploads/external_proforma.xlsx)",
    }),
    targetSheetId: Type.Number({
      description: "The worksheet ID of the target template to map into",
    }),
    targetRange: Type.Optional(
      Type.String({
        description:
          "Specific range of the target template to map against. Defaults to the used range.",
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
      const targetRange = params.targetRange || "A1:Z200";
      const targetResult = await getCellRanges(
        params.targetSheetId,
        [targetRange],
        { includeStyles: false, cellLimit: 5000 },
      );

      const targetCells = targetResult.worksheet.cells;
      const targetLabels: Record<string, string> = {};
      for (const [cellRef, value] of Object.entries(targetCells)) {
        if (typeof value === "string" && value.trim().length > 0) {
          targetLabels[cellRef] = value.trim();
        }
      }

      return toolSuccess({
        targetSheetName: targetResult.worksheet.name,
        sourceFile: params.sourceFile,
        targetLabels,
        instructions:
          "Use bash to run: xlsx-to-csv <sourceFile> source.csv, then read source.csv to extract " +
          "field labels. Compare source labels against the targetLabels above to build the mapping. " +
          "For each match, use set_cell_range to write the source values into the corresponding target cells.",
        targetCellCount: Object.keys(targetCells).length,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error translating pro forma";
      return toolError(message);
    }
  },
});
