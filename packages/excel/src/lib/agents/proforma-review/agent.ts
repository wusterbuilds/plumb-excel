import { agentRegistry } from "../registry";
import type { AgentDefinition } from "../types";
import { buildProformaSystemPrompt } from "./system-prompt";
import { annotateCellsTool } from "./tools/annotate-cells";
import { applyScenarioTool } from "./tools/apply-scenario";
import { auditProformaTool } from "./tools/audit-proforma";
import { compileDeepAuditTool } from "./tools/compile-deep-audit";
import { queryExternalDatabaseTool } from "./tools/query-database";
import { readProformaTool } from "./tools/read-proforma";
import { searchLocalProformasTool } from "./tools/search-local-proformas";
import { searchMarketDataTool } from "./tools/search-market-data";
import { translateProformaTool } from "./tools/translate-proforma";
import { undoScenarioTool } from "./tools/undo-scenario";

export const proformaReviewTools = [
  readProformaTool,
  auditProformaTool,
  translateProformaTool,
  applyScenarioTool,
  annotateCellsTool,
  undoScenarioTool,
  searchLocalProformasTool,
  searchMarketDataTool,
  queryExternalDatabaseTool,
  compileDeepAuditTool,
];

const proformaReviewAgent: AgentDefinition = {
  id: "proforma-review",
  name: "Pro Forma Review",
  description:
    "Review, audit, and create scenarios for commercial real estate pro formas.",
  tools: proformaReviewTools,
  buildSystemPrompt: buildProformaSystemPrompt,
};

export function registerProformaReviewAgent(): void {
  agentRegistry.register(proformaReviewAgent);
}
