import { Type } from "@sinclair/typebox";
import { getWorksheetById, getWorksheetStableId } from "../../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../../tools/types";
import { registerAuditCell } from "../../../proforma-review/audit-cell-registry";
import { demoRegistry } from "../../demo-registry";
import {
  type AuditFlag,
  type AuditRunMetadata,
  documentAuditStore,
} from "../document-audit-store";
import { HARDCODED_FLAGS, HARDCODED_SUMMARY } from "../hardcoded-flags";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#E74C3C",
  warning: "#F39C12",
};

const BORDER_SIDES: { index: Excel.BorderIndex }[] = [
  { index: Excel.BorderIndex.edgeTop },
  { index: Excel.BorderIndex.edgeBottom },
  { index: Excel.BorderIndex.edgeLeft },
  { index: Excel.BorderIndex.edgeRight },
];

async function annotateFlag(flag: AuditFlag): Promise<void> {
  if (flag.location.sheetId < 0 || !flag.location.cell) return;

  try {
    await Excel.run(async (context) => {
      const sheet = await getWorksheetById(context, flag.location.sheetId);
      if (!sheet) return;

      const color = SEVERITY_COLORS[flag.severity] || SEVERITY_COLORS.warning;
      const cellRange = sheet.getRange(flag.location.cell);

      for (const { index } of BORDER_SIDES) {
        const border = cellRange.format.borders.getItem(index);
        border.style = Excel.BorderLineStyle.continuous;
        border.weight = Excel.BorderWeight.thick;
        border.color = color;
      }

      const supportsNotes = Office.context.requirements.isSetSupported(
        "ExcelApi",
        "1.17",
      );
      const supportsComments = Office.context.requirements.isSetSupported(
        "ExcelApi",
        "1.10",
      );

      const noteText = `[Audit] ${flag.flagType.replace(/_/g, " ")} — ${flag.evidence.documentName}${flag.evidence.page ? ` p.${flag.evidence.page}` : ""}: ${flag.evidence.quotedText.slice(0, 120)}...`;

      if (supportsNotes) {
        cellRange.load("address");
        await context.sync();
        const addr = cellRange.address.split("!")[1] || cellRange.address;
        sheet.notes.add(addr, noteText);
      } else if (supportsComments) {
        cellRange.load("address");
        await context.sync();
        const addr = cellRange.address.split("!")[1] || cellRange.address;
        sheet.comments.add(addr, noteText);
      }

      await context.sync();
    });
  } catch (err) {
    console.error(
      `[DocumentAudit] Failed to annotate ${flag.location.cell}:`,
      err,
    );
  }
}

async function resolveHardcodedLocations(
  flags: AuditFlag[],
): Promise<AuditFlag[]> {
  try {
    return await Excel.run(async (context) => {
      const sheets = context.workbook.worksheets;
      sheets.load("items/name");
      await context.sync();

      const sheetMap = new Map<string, Excel.Worksheet>();
      for (const sheet of sheets.items) {
        sheetMap.set(sheet.name.toLowerCase(), sheet);
      }

      const resolved = flags.map((f) => ({
        ...f,
        location: { ...f.location },
      }));

      for (const flag of resolved) {
        const sheet = sheetMap.get(flag.location.sheetName.toLowerCase());
        if (!sheet) continue;

        const stableId = await getWorksheetStableId(context, sheet);
        flag.location.sheetId = stableId;

        const usedRange = sheet.getUsedRangeOrNullObject();
        usedRange.load(
          "values,address,rowIndex,columnIndex,rowCount,columnCount",
        );
        await context.sync();

        if (usedRange.isNullObject) continue;

        const values = usedRange.values;
        const startRow = usedRange.rowIndex;
        const startCol = usedRange.columnIndex;
        const needle = flag.location.rowLabel
          .toLowerCase()
          .replace(/\s*\(missing\)\s*$/, "");

        for (let r = 0; r < values.length; r++) {
          let found = false;
          for (let c = 0; c < Math.min(values[r].length, 3); c++) {
            const cellVal = String(values[r][c] ?? "")
              .toLowerCase()
              .trim();
            if (
              cellVal.includes(needle) ||
              (needle.includes(cellVal) && cellVal.length > 3)
            ) {
              const valueCol = Math.min(c + 1, values[r].length - 1);
              const absRow = startRow + r + 1;
              const absCol = startCol + valueCol;
              const colLetter =
                absCol < 26
                  ? String.fromCharCode(65 + absCol)
                  : String.fromCharCode(64 + Math.floor(absCol / 26)) +
                    String.fromCharCode(65 + (absCol % 26));
              flag.location.cell = `${colLetter}${absRow}`;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      return resolved;
    });
  } catch (err) {
    console.warn("[DocumentAudit] Failed to resolve hardcoded locations:", err);
    return flags;
  }
}

export const submitDocumentAuditTool = defineTool({
  name: "submit_document_audit",
  label: "Submit Document Audit",
  description:
    "Submit structured audit findings after cross-referencing uploaded diligence documents " +
    "against the pro forma. Each flag identifies a discrepancy with evidence, suggested correction, " +
    "and estimated impact. The findings render as an interactive dashboard where the user can " +
    "Accept, Override, or Dismiss each flag.",
  parameters: Type.Object({
    documentsAudited: Type.Array(
      Type.Object({
        name: Type.String(),
        uploadDate: Type.Optional(Type.String()),
      }),
      { description: "Documents that were audited" },
    ),
    proformaVersion: Type.String({
      description: "Active pro forma identifier",
    }),
    flags: Type.Array(
      Type.Object({
        id: Type.String({ description: "Unique flag identifier" }),
        location: Type.Object({
          sheetId: Type.Number(),
          sheetName: Type.String(),
          cell: Type.String({ description: "Cell address in A1 notation" }),
          rowLabel: Type.String({ description: "Human-readable row label" }),
        }),
        flagType: Type.Union([
          Type.Literal("wrong_value"),
          Type.Literal("missing_line_item"),
          Type.Literal("inconsistent_assumption"),
        ]),
        severity: Type.Union([
          Type.Literal("critical"),
          Type.Literal("warning"),
        ]),
        currentValue: Type.String(),
        evidence: Type.Object({
          documentName: Type.String(),
          page: Type.Optional(Type.Number()),
          quotedText: Type.String(),
        }),
        suggestedValue: Type.String(),
        estimatedImpact: Type.String(),
      }),
      { description: "Array of audit flags" },
    ),
    summary: Type.Object({
      criticalCount: Type.Number(),
      warningCount: Type.Number(),
      missingCount: Type.Number(),
      noiImpact: Type.String(),
      valueImpact: Type.String(),
    }),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const isHardcoded = demoRegistry.isHardcoded();
      const flags: AuditFlag[] = isHardcoded
        ? await resolveHardcodedLocations(HARDCODED_FLAGS)
        : (params.flags as AuditFlag[]);
      const summary = isHardcoded ? HARDCODED_SUMMARY : params.summary;

      const auditRunId = `audit-${Date.now()}`;
      const metadata: AuditRunMetadata = {
        auditRunId,
        timestamp: Date.now(),
        documentsAudited: params.documentsAudited,
        proformaVersion: params.proformaVersion,
        summary,
      };

      documentAuditStore.setActiveRun(metadata, flags);

      for (const flag of flags) {
        if (flag.location.cell) {
          await annotateFlag(flag);
        }

        const cellKey = flag.location.cell
          ? `${flag.location.sheetName}!${flag.location.cell}`
          : `${flag.location.sheetName}!${flag.location.rowLabel}`;

        registerAuditCell(cellKey, {
          targetRange: cellKey,
          targetLabel: flag.location.rowLabel,
          targetValue: flag.currentValue,
          verdict:
            flag.severity === "critical" ? "above_market" : "above_market",
          verdictExplanation: `${flag.evidence.documentName}: ${flag.evidence.quotedText.slice(0, 80)}...`,
          sources: [
            {
              sourceLabel: flag.evidence.documentName,
              sourceRef: {
                type: "local_file",
                path: flag.evidence.documentName,
                section: flag.evidence.page
                  ? `Page ${flag.evidence.page}`
                  : undefined,
                displayName: flag.evidence.documentName,
              },
              summary: flag.evidence.quotedText,
            },
          ],
          timestamp: Date.now(),
        });
      }

      return toolSuccess({
        auditRunId,
        documentsAudited: params.documentsAudited,
        proformaVersion: params.proformaVersion,
        flags,
        summary,
        isHardcoded,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error submitting document audit";
      return toolError(message);
    }
  },
});
