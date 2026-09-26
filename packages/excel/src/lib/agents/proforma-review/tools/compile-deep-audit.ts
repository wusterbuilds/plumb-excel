import { Type } from "@sinclair/typebox";
import { defineTool, toolSuccess } from "../../../tools/types";
import { registerAuditCell } from "../audit-cell-registry";

const SourceRefSchema = Type.Union([
  Type.Object({
    type: Type.Literal("local_file"),
    path: Type.String(),
    section: Type.Optional(Type.String()),
    displayName: Type.String(),
  }),
  Type.Object({
    type: Type.Literal("web_url"),
    url: Type.String(),
    section: Type.Optional(Type.String()),
    displayName: Type.String(),
  }),
  Type.Object({
    type: Type.Literal("database"),
    database: Type.String(),
    queryId: Type.String(),
    displayName: Type.String(),
  }),
]);

export const compileDeepAuditTool = defineTool({
  name: "compile_deep_audit",
  label: "Compile Deep Audit",
  description:
    "Compile findings from multiple data sources into a structured deep audit report. " +
    "Call this after running search_local_proformas, search_market_data, and/or query_external_database. " +
    "Produces a verdict and registers the audit data for the citation panel.",
  parameters: Type.Object({
    targetRange: Type.String({
      description: 'Cell reference being audited (e.g., "Assumptions!D5")',
    }),
    targetLabel: Type.String({
      description: 'Human-readable label (e.g., "Vacancy Rate")',
    }),
    targetValue: Type.String({
      description: 'Current value in the cell (e.g., "3.5%")',
    }),
    findings: Type.Array(
      Type.Object({
        source: Type.Union([
          Type.Literal("local_history"),
          Type.Literal("web_search"),
          Type.Literal("external_db"),
        ]),
        sourceLabel: Type.String({
          description:
            'Display name for the source (e.g., "Internal History", "CBRE Q4 Report", "CoStar")',
        }),
        sourceRef: SourceRefSchema,
        dataPoints: Type.Array(
          Type.Object({
            label: Type.String(),
            value: Type.String(),
          }),
        ),
        summary: Type.String({
          description: "Brief summary of findings from this source",
        }),
        isMock: Type.Optional(
          Type.Boolean({
            description: "True if this finding uses simulated/demo data",
          }),
        ),
        disclaimer: Type.Optional(
          Type.String({
            description: "Disclaimer text (e.g. for simulated data)",
          }),
        ),
        blocked: Type.Optional(
          Type.Boolean({
            description:
              "True if this data source was unavailable (e.g. CORS blocked)",
          }),
        ),
        actionRequired: Type.Optional(
          Type.String({
            description: "Action the user needs to take to enable this source",
          }),
        ),
      }),
    ),
    verdict: Type.Union([
      Type.Literal("within_range"),
      Type.Literal("above_market"),
      Type.Literal("below_market"),
      Type.Literal("insufficient_data"),
    ]),
    verdictExplanation: Type.String({
      description: "Explanation of the verdict",
    }),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    registerAuditCell(params.targetRange, {
      targetRange: params.targetRange,
      targetLabel: params.targetLabel,
      targetValue: params.targetValue,
      verdict: params.verdict,
      verdictExplanation: params.verdictExplanation,
      sources: params.findings.map((f) => ({
        sourceLabel: f.sourceLabel,
        sourceRef: f.sourceRef,
        summary: f.summary,
      })),
      timestamp: Date.now(),
    });

    return toolSuccess({
      targetRange: params.targetRange,
      targetLabel: params.targetLabel,
      targetValue: params.targetValue,
      findings: params.findings,
      verdict: params.verdict,
      verdictExplanation: params.verdictExplanation,
    });
  },
});
