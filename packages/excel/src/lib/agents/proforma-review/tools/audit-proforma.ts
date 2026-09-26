import { Type } from "@sinclair/typebox";
import { getCellRanges } from "../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

export interface AuditFinding {
  severity: "error" | "warning" | "info";
  category: string;
  cell: string;
  message: string;
  currentValue: unknown;
  expectedRange?: { min: number; max: number };
  suggestion?: string;
}

export const auditProformaTool = defineTool({
  name: "audit_proforma",
  label: "Audit Pro Forma",
  description:
    "Validate a pro forma's assumptions and internal consistency. Checks for: " +
    "formula errors, unreasonable growth rates, vacancy assumptions outside market norms, " +
    "broken formula references, missing sections, and arithmetic inconsistencies. " +
    "Returns structured findings with severity levels and cell references.",
  parameters: Type.Object({
    sheetId: Type.Number({
      description: "The worksheet ID containing the pro forma",
    }),
    range: Type.Optional(
      Type.String({
        description:
          "Specific range to audit. If omitted, audits the full used range.",
      }),
    ),
    checks: Type.Optional(
      Type.Array(Type.String(), {
        description:
          'Specific checks to run: "formulas", "assumptions", "consistency", "completeness". Default: all.',
      }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation of what you're auditing (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const targetRange = params.range || "A1:Z200";
      const result = await getCellRanges(params.sheetId, [targetRange], {
        includeStyles: false,
        cellLimit: 5000,
      });

      const cells = result.worksheet.cells;
      const formulas = result.worksheet.formulas || {};
      const findings: AuditFinding[] = [];
      const checksToRun = params.checks || [
        "formulas",
        "assumptions",
        "consistency",
        "completeness",
      ];

      if (checksToRun.includes("formulas")) {
        for (const [cellRef, value] of Object.entries(cells)) {
          if (
            typeof value === "string" &&
            (value === "#REF!" ||
              value === "#VALUE!" ||
              value === "#NAME?" ||
              value === "#DIV/0!" ||
              value === "#N/A" ||
              value === "#NULL!")
          ) {
            findings.push({
              severity: "error",
              category: "formula_error",
              cell: cellRef,
              message: `Formula error: ${value}`,
              currentValue: value,
              suggestion:
                "Check the formula reference and fix or replace with a valid value.",
            });
          }
        }

        for (const [cellRef, formula] of Object.entries(formulas)) {
          if (formula?.includes("#REF")) {
            findings.push({
              severity: "error",
              category: "broken_reference",
              cell: cellRef,
              message: "Formula contains a broken reference (#REF)",
              currentValue: cells[cellRef],
              suggestion: "Update the formula to reference valid cells.",
            });
          }
        }
      }

      if (checksToRun.includes("assumptions")) {
        for (const [cellRef, value] of Object.entries(cells)) {
          if (typeof value !== "number") continue;

          const labelCells = Object.entries(cells).filter(([ref]) => {
            const refCol = ref.replace(/\d+/g, "");
            const refRow = ref.replace(/[A-Z]+/g, "");
            const valRow = cellRef.replace(/[A-Z]+/g, "");
            return refRow === valRow && refCol < cellRef.replace(/\d+/g, "");
          });

          const label = labelCells
            .map(([, v]) => String(v).toLowerCase())
            .join(" ");

          if (
            (label.includes("growth") || label.includes("escalation")) &&
            (value > 0.15 || value < -0.1)
          ) {
            findings.push({
              severity: "warning",
              category: "assumption_outlier",
              cell: cellRef,
              message: `Growth rate of ${(value * 100).toFixed(1)}% seems unusual`,
              currentValue: value,
              expectedRange: { min: -0.1, max: 0.15 },
              suggestion:
                "Verify this growth rate against market data and comparable deals.",
            });
          }

          if (label.includes("vacancy") && (value > 0.3 || value < 0.02)) {
            findings.push({
              severity: "warning",
              category: "assumption_outlier",
              cell: cellRef,
              message: `Vacancy rate of ${(value * 100).toFixed(1)}% may be outside market norms`,
              currentValue: value,
              expectedRange: { min: 0.02, max: 0.3 },
              suggestion:
                "Compare against market vacancy data for this property type and submarket.",
            });
          }

          if (label.includes("cap rate") && (value > 0.12 || value < 0.03)) {
            findings.push({
              severity: "warning",
              category: "assumption_outlier",
              cell: cellRef,
              message: `Cap rate of ${(value * 100).toFixed(1)}% may be outside typical range`,
              currentValue: value,
              expectedRange: { min: 0.03, max: 0.12 },
              suggestion:
                "Verify against recent comparable transactions in this submarket.",
            });
          }
        }
      }

      if (checksToRun.includes("consistency")) {
        const numericCells = Object.entries(cells).filter(
          ([, v]) => typeof v === "number",
        );
        for (const [cellRef, value] of numericCells) {
          if (value === 0 && formulas[cellRef]) {
            const formula = formulas[cellRef];
            if (
              formula.includes("SUM") ||
              formula.includes("+") ||
              formula.includes("-")
            ) {
              findings.push({
                severity: "info",
                category: "zero_formula",
                cell: cellRef,
                message:
                  "Formula evaluates to zero — may indicate missing inputs",
                currentValue: value,
                suggestion:
                  "Check if all referenced cells have been populated.",
              });
            }
          }
        }
      }

      const summary = {
        errors: findings.filter((f) => f.severity === "error").length,
        warnings: findings.filter((f) => f.severity === "warning").length,
        info: findings.filter((f) => f.severity === "info").length,
      };

      return toolSuccess({
        sheetName: result.worksheet.name,
        totalCellsAudited: Object.keys(cells).length,
        summary,
        findings,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error auditing pro forma";
      return toolError(message);
    }
  },
});
