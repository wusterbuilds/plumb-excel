import { Type } from "@sinclair/typebox";
import { getCellRanges } from "../../../excel/api";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

export const readProformaTool = defineTool({
  name: "read_proforma",
  label: "Read Pro Forma",
  description:
    "Read structured data from a pro forma worksheet. Detects common pro forma layouts " +
    "(revenue, expenses, NOI, debt service, cash flow) and returns data organized by section. " +
    "Use this before auditing or creating scenarios to understand the spreadsheet structure.",
  parameters: Type.Object({
    sheetId: Type.Number({
      description: "The worksheet ID (1-based index) containing the pro forma",
    }),
    range: Type.Optional(
      Type.String({
        description:
          "Specific range to read in A1 notation. If omitted, reads the used range.",
      }),
    ),
    sections: Type.Optional(
      Type.Array(Type.String(), {
        description:
          'Filter to specific sections: "revenue", "expenses", "noi", "debt_service", "cash_flow", "assumptions"',
      }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation of what you're reading (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const targetRange = params.range || "A1:Z200";
      const result = await getCellRanges(params.sheetId, [targetRange], {
        includeStyles: true,
        cellLimit: 5000,
      });

      const cells = result.worksheet.cells;
      const formulas = result.worksheet.formulas || {};

      const sections: Record<string, Record<string, unknown>> = {};
      const sectionKeywords: Record<string, string[]> = {
        revenue: [
          "revenue",
          "income",
          "rent",
          "rental income",
          "gross income",
          "egi",
          "effective gross",
        ],
        expenses: [
          "expense",
          "operating expense",
          "opex",
          "cost",
          "management fee",
          "insurance",
          "tax",
          "property tax",
          "utilities",
          "maintenance",
          "repair",
        ],
        noi: ["noi", "net operating income", "operating income"],
        debt_service: [
          "debt",
          "mortgage",
          "loan",
          "interest",
          "principal",
          "debt service",
          "dscr",
        ],
        cash_flow: [
          "cash flow",
          "net cash",
          "btcf",
          "atcf",
          "before tax",
          "after tax",
          "irr",
          "yield",
        ],
        assumptions: [
          "assumption",
          "growth",
          "vacancy",
          "cap rate",
          "discount",
          "inflation",
          "escalation",
        ],
      };

      for (const [cellRef, value] of Object.entries(cells)) {
        if (typeof value !== "string") continue;
        const lower = value.toLowerCase().trim();
        for (const [section, keywords] of Object.entries(sectionKeywords)) {
          if (params.sections && !params.sections.includes(section)) continue;
          if (keywords.some((kw) => lower.includes(kw))) {
            if (!sections[section]) sections[section] = {};
            sections[section][cellRef] = {
              label: value,
              formula: formulas[cellRef] || undefined,
            };
          }
        }
      }

      return toolSuccess({
        sheetName: result.worksheet.name,
        sheetId: result.worksheet.sheetId,
        dimension: result.worksheet.dimension,
        totalCells: Object.keys(cells).length,
        sections,
        rawCells: cells,
        formulas,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error reading pro forma";
      return toolError(message);
    }
  },
});
