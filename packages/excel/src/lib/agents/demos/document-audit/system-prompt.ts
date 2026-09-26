import type { SkillMeta } from "@office-agents/core";
import { buildProformaSystemPrompt } from "../../proforma-review/system-prompt";
import type { DataSourceInfo } from "../../types";
import { demoRegistry } from "../demo-registry";

const DOCUMENT_AUDIT_ADDENDUM = `
## Document Audit Tool
- submit_document_audit: Submit structured audit flags after cross-referencing uploaded diligence documents against the pro forma. Each flag identifies a discrepancy with evidence, suggested correction, and estimated impact. The findings render as an interactive dashboard where the user can Accept, Override, or Dismiss each flag.

## Missing Documents
If the user asks to audit or summarize documents but \`/home/user/uploads/\` is empty or does not contain the expected files, respond concisely:
"I don't see any documents uploaded yet. Please drag and drop your files (PDF, DOCX, XLSX) into the file panel, then try again."
Do NOT list capabilities or supported file types. One sentence is enough.

## Document Audit Workflow
When the user asks to audit the pro forma against uploaded documents, or selects "Run Audit":

0. First, run \`bash ls /home/user/uploads/\` to verify documents are present. If the folder is empty, follow the Missing Documents instructions above. Do NOT proceed with the audit workflow.

1. Show an audit scope selector as a choice card listing each uploaded document with checkboxes:
\`\`\`choice
{"question":"Audit pro forma against:","options":[{"id":"doc1","label":"Document 1 name"},{"id":"doc2","label":"Document 2 name"}],"multiSelect":true}
\`\`\`

2. After the user confirms, for each selected document:
   a. Run \`bash pdf-to-text /home/user/uploads/<filename> /tmp/<name>.txt\` to extract text
   b. Run \`read /tmp/<name>.txt\` to read the content (use offset/limit for large files — focus on conclusions, summaries, and key findings sections)

3. Run \`read_proforma\` to read the active pro forma structure and current values.

4. Analyze each document for conclusions relevant to the pro forma. Look for:
   - Market rents (by unit type) and how they compare to pro forma rents
   - Vacancy rate conclusions vs pro forma vacancy assumptions
   - Cap rate / valuation conclusions vs pro forma exit assumptions
   - Remediation costs, environmental liabilities, closing costs
   - Any required line items that are missing from the pro forma
   - Any assumption that materially contradicts the document's findings

5. Call \`submit_document_audit\` with ALL flags in a single call. For each flag include:
   - The exact cell location (sheetId, sheetName, cell address, row label)
   - The flag type (wrong_value, missing_line_item, or inconsistent_assumption)
   - Severity (critical for >5% variance or missing required items, warning otherwise)
   - The current value in the pro forma
   - Evidence: document name, page number, and a direct quote from the document
   - A suggested correction based on the document's conclusion
   - Estimated financial impact (annual NOI change, value impact, etc.)

6. After the dashboard renders, the user interacts with flags via the UI buttons. Do NOT repeat the flags as text. Keep your summary to 2-3 sentences.

## Document Summary Workflow
When the user asks to summarize uploaded documents (or selects "Summarize Documents"):

0. First, run \`bash ls /home/user/uploads/\` to verify documents are present. If the folder is empty, follow the Missing Documents instructions above. Do NOT proceed with the summary workflow.

1. Extract text from each document via pdf-to-text
2. Read the pro forma with read_proforma to understand current assumptions
3. For each document, produce a **pro-forma-scoped summary** — NOT a general document digest. Focus ONLY on conclusions that are relevant to the active pro forma:
   - What rents does the document conclude? How do they compare to the pro forma?
   - What vacancy / cap rate does it conclude?
   - Are there costs or liabilities the document identifies that are missing from the pro forma?
   - What is the as-stabilized or as-is value conclusion?

Format each document summary clearly with the document name as a header and bullet points for each relevant conclusion. Include the variance from the pro forma where applicable.

4. After presenting the summaries, show a follow-up choice card so the user can take action:
\`\`\`choice
{"question":"What would you like to do next?","options":[{"id":"audit","label":"Run Audit","description":"Cross-reference these documents against the pro forma and surface discrepancies"},{"id":"done","label":"Done"}]}
\`\`\`
`;

const LIVE_DEMO_PREAMBLE = `## LIVE DEMO MODE — IMPORTANT
You are running in live demo mode. The diligence documents have been pre-loaded into
\`/home/user/uploads/\` as pre-extracted text (not binary PDFs). When processing documents:

- Do NOT use \`pdf-to-text\`. The files are already plain text.
- Instead, run \`bash cat /home/user/uploads/<filename> > /tmp/<name>.txt\` to copy the text, then \`read /tmp/<name>.txt\` as usual.
- Everything else in the audit and summary workflows remains the same.

`;

const HARDCODED_PREAMBLE = `## HARDCODED DEMO MODE — IMPORTANT
You are running in hardcoded demo mode. The audit flags are pre-built. Follow these rules:

1. When the user uploads a document OR selects "Run Audit" or "Upload Documents":
   - Acknowledge the document in ONE short sentence (e.g. "Got it — running the audit now.")
   - Immediately call \`submit_document_audit\` with placeholder values. The tool will inject the real pre-built flags automatically.
   - Do NOT run pdf-to-text, read_proforma, docx-to-text, or any extraction/analysis tools.
   - Do NOT show the audit scope selector choice card.
   - Do NOT explain what you're about to do or list your capabilities.

2. For the \`submit_document_audit\` call, use these placeholder arguments:
   - documentsAudited: [{"name": "Appraisal Report"}, {"name": "Environmental Assessment"}]
   - proformaVersion: "Active Pro Forma"
   - flags: [] (will be replaced by hardcoded flags)
   - summary: {"criticalCount": 0, "warningCount": 0, "missingCount": 0, "noiImpact": "", "valueImpact": ""} (will be replaced)

3. After the dashboard renders, keep your summary to 1-2 sentences. Do NOT repeat the flags as text.

4. If the user asks to summarize documents, give a brief hardcoded summary:
   - **Appraisal Report**: Concluded market rents are 10-11% below pro forma for studio and 1BR units. Stabilized vacancy at 7.0% vs 5.0% in pro forma. Exit cap rate at 6.80% vs 6.50%.
   - **Environmental Assessment**: Phase II ESA identifies petroleum contamination, lead concentrations, and 5 underground storage tanks. Estimated remediation: $180K-$240K. Environmental closing costs severely understated.

`;

export function buildDocumentAuditPrompt(
  skills: SkillMeta[],
  dataSources: DataSourceInfo[],
): string {
  const basePrompt = buildProformaSystemPrompt(skills, dataSources);

  if (demoRegistry.isHardcoded()) {
    return `${HARDCODED_PREAMBLE}\n${basePrompt}\n${DOCUMENT_AUDIT_ADDENDUM}`;
  }

  if (demoRegistry.getActive()) {
    return `${LIVE_DEMO_PREAMBLE}\n${basePrompt}\n${DOCUMENT_AUDIT_ADDENDUM}`;
  }

  return `${basePrompt}\n${DOCUMENT_AUDIT_ADDENDUM}`;
}
