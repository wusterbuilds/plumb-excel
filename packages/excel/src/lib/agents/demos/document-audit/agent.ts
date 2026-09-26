import { writeFile } from "@office-agents/core";
import { proformaReviewTools } from "../../proforma-review/agent";
import type { AgentDefinition } from "../../types";
import type { DemoScenario } from "../types";
import { DocumentAuditDashboard } from "./components/document-audit-dashboard";
import {
  APPRAISAL_REPORT_TEXT,
  DEMO_DOC_NAMES,
  ENVIRONMENTAL_ASSESSMENT_TEXT,
} from "./demo-documents";
import { buildDocumentAuditPrompt } from "./system-prompt";
import { submitDocumentAuditTool } from "./tools/submit-document-audit";

const agent: AgentDefinition = {
  id: "document-audit",
  name: "Document Audit",
  description:
    "Audit pro forma against diligence documents (appraisal, environmental assessment).",
  tools: [...proformaReviewTools, submitDocumentAuditTool],
  buildSystemPrompt: buildDocumentAuditPrompt,
};

function buildGreeting(docs: string[]): string {
  const fileList = docs.map((name) => `**${name}**`).join(" and ");
  return `${fileList} have been uploaded but not yet audited against the current pro forma. What would you like to do?

\`\`\`choice
{"question":"Choose an action","options":[{"id":"summarize","label":"Summarize Documents","description":"Get pro-forma-scoped summaries of what each document concludes"},{"id":"audit","label":"Run Audit","description":"Cross-reference documents against the pro forma and surface discrepancies"},{"id":"later","label":"Dismiss"}]}
\`\`\``;
}

async function seedDemoDocuments(): Promise<void> {
  const encoder = new TextEncoder();
  await writeFile(
    `/home/user/uploads/${DEMO_DOC_NAMES[0]}`,
    encoder.encode(APPRAISAL_REPORT_TEXT),
  );
  await writeFile(
    `/home/user/uploads/${DEMO_DOC_NAMES[1]}`,
    encoder.encode(ENVIRONMENTAL_ASSESSMENT_TEXT),
  );
}

export const documentAuditScenario: DemoScenario = {
  id: "document-audit",
  name: "Document Audit",
  description:
    "Audit pro forma against diligence documents (appraisal, environmental)",
  agent,
  supportsHardcoded: true,
  getGreeting: async () => {
    await seedDemoDocuments();
    return buildGreeting(DEMO_DOC_NAMES);
  },
  getToolComponents: () => ({
    submit_document_audit: DocumentAuditDashboard,
  }),
};
