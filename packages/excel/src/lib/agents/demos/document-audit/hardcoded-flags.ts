import type { AuditFlag } from "./document-audit-store";

export const HARDCODED_FLAGS: AuditFlag[] = [
  {
    id: "flag-studio-rent",
    location: {
      sheetId: -1,
      sheetName: "Unit Mix",
      cell: "",
      rowLabel: "Studio Rent",
    },
    flagType: "wrong_value",
    severity: "critical",
    currentValue: "$2,950/mo",
    evidence: {
      documentName: "Appraisal Report",
      page: 47,
      quotedText:
        "Market rent for studio units in this submarket is concluded at $2,650 per month based on comparable rental data and current absorption trends.",
    },
    suggestedValue: "$2,650/mo",
    estimatedImpact:
      "Studio rent 11% above appraiser's concluded market rent. Estimated gross potential rent impact: -$43,200/year.",
  },
  {
    id: "flag-1br-rent",
    location: {
      sheetId: -1,
      sheetName: "Unit Mix",
      cell: "",
      rowLabel: "1BR/1BA Rent",
    },
    flagType: "wrong_value",
    severity: "critical",
    currentValue: "$3,800/mo",
    evidence: {
      documentName: "Appraisal Report",
      page: 48,
      quotedText:
        "Market rent for one-bedroom units is concluded at $3,450 per month, reflecting a 10% premium over submarket average due to building amenities.",
    },
    suggestedValue: "$3,450/mo",
    estimatedImpact:
      "1BR rent 10% above appraiser's concluded market rent. Estimated gross potential rent impact: -$50,400/year.",
  },
  {
    id: "flag-vacancy",
    location: {
      sheetId: -1,
      sheetName: "Assumptions",
      cell: "",
      rowLabel: "Stabilized Vacancy",
    },
    flagType: "inconsistent_assumption",
    severity: "warning",
    currentValue: "5.0%",
    evidence: {
      documentName: "Appraisal Report",
      page: 52,
      quotedText:
        "Stabilized vacancy is concluded at 7.0%, consistent with the competitive set average of 6.8% and accounting for the subject's lease-up risk profile.",
    },
    suggestedValue: "7.0%",
    estimatedImpact:
      "Vacancy understated by 2 percentage points. Estimated effective gross income impact: -$28,000/year.",
  },
  {
    id: "flag-cap-rate",
    location: {
      sheetId: -1,
      sheetName: "Assumptions",
      cell: "",
      rowLabel: "Exit Cap Rate",
    },
    flagType: "inconsistent_assumption",
    severity: "warning",
    currentValue: "6.50%",
    evidence: {
      documentName: "Appraisal Report",
      page: 61,
      quotedText:
        "The market-derived capitalization rate is concluded at 6.80% based on analysis of recent comparable sales in the Brooklyn submarket.",
    },
    suggestedValue: "6.80%",
    estimatedImpact:
      "Exit cap rate is 30bps below appraiser's market-derived rate. Estimated terminal value impact: -$340,000.",
  },
  {
    id: "flag-remediation-missing",
    location: {
      sheetId: -1,
      sheetName: "Renovation Budget",
      cell: "",
      rowLabel: "Remediation Cost (missing)",
    },
    flagType: "missing_line_item",
    severity: "critical",
    currentValue: "(not present)",
    evidence: {
      documentName: "Environmental Assessment",
      page: 12,
      quotedText:
        "Phase II ESA identifies active petroleum contamination at multiple sampling locations, hazardous lead concentrations at 4 of 6 borings, and 5 active underground storage tanks requiring removal. Estimated remediation cost range: $180,000–$240,000.",
    },
    suggestedValue: "$210,000",
    estimatedImpact:
      "No remediation line item found in renovation budget despite documented environmental contamination. Midpoint estimate: $210,000 direct cost impact.",
  },
  {
    id: "flag-env-closing-cost",
    location: {
      sheetId: -1,
      sheetName: "Closing Costs",
      cell: "",
      rowLabel: "Environmental Closing Cost",
    },
    flagType: "missing_line_item",
    severity: "critical",
    currentValue: "$1,500",
    evidence: {
      documentName: "Environmental Assessment",
      page: 18,
      quotedText:
        "Environmental remediation and monitoring costs are estimated at $195,000–$265,000 based on site conditions documented in this assessment. A Remedial Action Work Plan (RAWP) is required prior to construction start, with an estimated 6–8 week delay.",
    },
    suggestedValue: "$230,000",
    estimatedImpact:
      "Environmental closing cost of $1,500 is severely understated given documented site conditions. Cross-referenced with Appraisal Section 4 range of $195K–$265K. Suggested midpoint: $230,000.",
  },
];

export const HARDCODED_SUMMARY = {
  criticalCount: 4,
  warningCount: 2,
  missingCount: 2,
  noiImpact: "-$121,600/year",
  valueImpact: "-$780,000",
};
