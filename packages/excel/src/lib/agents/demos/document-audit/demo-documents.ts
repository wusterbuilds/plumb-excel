/**
 * Fully synthetic fixtures for the document-audit demo.
 *
 * Names, addresses, companies, figures, and findings are fictional. Keeping
 * the fixtures in source makes the demo deterministic without redistributing
 * third-party reports or customer material.
 */
export const DEMO_DOC_NAMES = [
  "Harbor Point Appraisal — Synthetic.pdf",
  "Harbor Point Environmental Review — Synthetic.pdf",
];

export const APPRAISAL_REPORT_TEXT = `
SYNTHETIC DEMO — NOT AN APPRAISAL

HARBOR POINT MIXED-USE DEVELOPMENT
100 Harbor Way, Example City, New York 10000
Effective date: January 15, 2026
Prepared for: Example Capital Partners
Prepared by: Sample Valuation Group

EXECUTIVE SUMMARY
Property type: Proposed mixed-use multifamily
Residential units: 180
Retail area: 12,000 square feet
As-is land value: $18,500,000
As-complete value: $86,000,000
As-stabilized value: $102,000,000
Stabilized occupancy: 94 percent

KEY ASSUMPTIONS
- Construction completes in 30 months.
- Stabilization occurs 18 months after completion.
- Environmental remediation allowance: $450,000.
- Residential rents grow 3 percent annually.
- Exit capitalization rate: 5.25 percent.

APPRAISAL CONDITIONS
The concluded value assumes the environmental items described in the separate
synthetic review are remediated before vertical construction. The development
budget supplied for review includes a $250,000 remediation line item.

This fixture was created for software demonstration and testing. It does not
describe a real property, client, appraiser, or transaction.
`;

export const ENVIRONMENTAL_ASSESSMENT_TEXT = `
SYNTHETIC DEMO — NOT AN ENVIRONMENTAL ASSESSMENT

HARBOR POINT MIXED-USE DEVELOPMENT
100 Harbor Way, Example City, New York 10000
Review date: December 20, 2025
Prepared for: Example Capital Partners
Prepared by: Sample Environmental Consulting

EXECUTIVE FINDINGS
Historic site operations may have affected two areas of soil. The synthetic
review recommends targeted excavation, off-site disposal, and installation of
a vapor barrier below the proposed residential structure.

ESTIMATED REMEDIATION COST
Low estimate: $410,000
Expected estimate: $475,000
High estimate: $560,000

SCHEDULE EFFECT
Remediation is expected to require six to eight weeks and should be completed
before foundation work. Regulatory closure documentation is assumed to be a
condition of the first construction-loan draw.

CROSS-DOCUMENT ISSUE
The appraisal assumes a $450,000 remediation allowance. The development budget
includes only $250,000, creating a potential funding gap of $160,000 to
$310,000 based on the environmental range.

This fixture was created for software demonstration and testing. It does not
describe a real property, client, consultant, or transaction.
`;
