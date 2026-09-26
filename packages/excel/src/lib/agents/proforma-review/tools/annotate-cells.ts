import { Type } from "@sinclair/typebox";
import { getWorksheetById } from "../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

const SEVERITY_COLORS: Record<string, string> = {
  error: "#E74C3C",
  warning: "#F39C12",
  info: "#3498DB",
  success: "#27AE60",
};

const BORDER_SIDES: { index: Excel.BorderIndex }[] = [
  { index: Excel.BorderIndex.edgeTop },
  { index: Excel.BorderIndex.edgeBottom },
  { index: Excel.BorderIndex.edgeLeft },
  { index: Excel.BorderIndex.edgeRight },
];

async function addNote(
  sheet: Excel.Worksheet,
  context: Excel.RequestContext,
  cellAddr: string,
  text: string,
): Promise<void> {
  const supportsNotes = Office.context.requirements.isSetSupported(
    "ExcelApi",
    "1.17",
  );
  const supportsComments = Office.context.requirements.isSetSupported(
    "ExcelApi",
    "1.10",
  );

  if (supportsNotes) {
    sheet.notes.add(cellAddr, text);
  } else if (supportsComments) {
    sheet.comments.add(cellAddr, text);
  }
  await context.sync();
}

export const annotateCellsTool = defineTool({
  name: "annotate_cells",
  label: "Annotate Cells",
  description:
    "Add color-coded borders and notes to cells to highlight findings or changes. " +
    "Useful after an audit to visually mark issues, or after a scenario to highlight modifications. " +
    "Supports severity levels (error=red, warning=orange, info=blue, success=green). " +
    "Does NOT modify cell values or formulas.",
  parameters: Type.Object({
    sheetId: Type.Number({
      description: "The worksheet ID",
    }),
    annotations: Type.Array(
      Type.Object({
        cell: Type.String({
          description: 'Cell reference in A1 notation (e.g. "B5")',
        }),
        severity: Type.Union(
          [
            Type.Literal("error"),
            Type.Literal("warning"),
            Type.Literal("info"),
            Type.Literal("success"),
          ],
          { description: "Determines border color" },
        ),
        note: Type.Optional(
          Type.String({
            description: "Comment/note to add to the cell",
          }),
        ),
      }),
      { description: "Array of cell annotations to apply" },
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  dirtyTracking: {
    getRanges: (p) =>
      p.annotations.map((a) => ({ sheetId: p.sheetId, range: a.cell })),
  },
  execute: async (_toolCallId, params) => {
    try {
      const applied: { cell: string; severity: string; note?: string }[] = [];

      await Excel.run(async (context) => {
        const sheet = await getWorksheetById(context, params.sheetId);
        if (!sheet) throw new Error(`Worksheet ${params.sheetId} not found`);

        for (const annotation of params.annotations) {
          const color =
            SEVERITY_COLORS[annotation.severity] || SEVERITY_COLORS.info;
          const cellRange = sheet.getRange(annotation.cell);

          for (const { index } of BORDER_SIDES) {
            const border = cellRange.format.borders.getItem(index);
            border.style = Excel.BorderLineStyle.continuous;
            border.weight = Excel.BorderWeight.thick;
            border.color = color;
          }

          if (annotation.note) {
            cellRange.load("address");
            await context.sync();
            const addr = cellRange.address.split("!")[1] || cellRange.address;
            await addNote(sheet, context, addr, annotation.note);
          }

          applied.push({
            cell: annotation.cell,
            severity: annotation.severity,
            note: annotation.note,
          });
        }

        await context.sync();
      });

      return toolSuccess({
        annotationsApplied: applied.length,
        annotations: applied,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error annotating cells";
      return toolError(message);
    }
  },
});
