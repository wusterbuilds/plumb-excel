import { Type } from "@sinclair/typebox";
import { defineTool, toolError, toolSuccess } from "../../../tools/types";

const CONNECTED_SOURCES_KEY = "plumb-connected-sources";

interface ConnectedSource {
  connectorId: string;
  connectionId: string;
  displayName: string;
  connectedAt: number;
  enabled: boolean;
}

function getConnectedDatabases(): ConnectedSource[] {
  try {
    const raw = localStorage.getItem(CONNECTED_SOURCES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function isDatabaseConnected(database: string): boolean {
  const sources = getConnectedDatabases();
  return sources.some((s) => s.connectorId === database && s.enabled);
}

const MOCK_DATA: Record<
  string,
  Record<
    string,
    (filters: Record<string, string>) => {
      results: Record<string, unknown>[];
      queryDescription: string;
    }
  >
> = {
  costar: {
    vacancy_comps: (filters) => ({
      queryDescription: `Vacancy comps for ${filters.propertyType || "multifamily"} in ${filters.market || "Austin"}`,
      results: [
        {
          property: "The Domain Apartments",
          submarket: filters.market || "Austin CBD",
          vacancy: "4.2%",
          units: 350,
          vintage: 2019,
          source: "CoStar Analytics",
        },
        {
          property: "Mueller District Living",
          submarket: filters.market || "Austin East",
          vacancy: "3.8%",
          units: 280,
          vintage: 2021,
          source: "CoStar Analytics",
        },
        {
          property: "South Congress Residences",
          submarket: filters.market || "Austin South",
          vacancy: "5.1%",
          units: 200,
          vintage: 2018,
          source: "CoStar Analytics",
        },
      ],
    }),
    rent_comps: (filters) => ({
      queryDescription: `Rent comps for ${filters.propertyType || "multifamily"} in ${filters.market || "Austin"}`,
      results: [
        {
          property: "East 6th Lofts",
          avgRent: "$1,850/mo",
          rentPSF: "$2.45/sf",
          occupancy: "95.8%",
          submarket: filters.market || "Austin CBD",
        },
        {
          property: "Riverside Commons",
          avgRent: "$1,620/mo",
          rentPSF: "$2.18/sf",
          occupancy: "93.2%",
          submarket: filters.market || "Austin East",
        },
      ],
    }),
    cap_rate_comps: (filters) => ({
      queryDescription: `Cap rate transactions for ${filters.propertyType || "multifamily"} in ${filters.market || "Austin"}`,
      results: [
        {
          property: "Barton Creek Apartments",
          salePrice: "$42,500,000",
          capRate: "4.8%",
          pricePerUnit: "$212,500",
          saleDate: "2025-Q3",
        },
        {
          property: "Lamar Union Residences",
          salePrice: "$38,000,000",
          capRate: "5.1%",
          pricePerUnit: "$195,000",
          saleDate: "2025-Q2",
        },
      ],
    }),
    market_analytics: (filters) => ({
      queryDescription: `Market overview for ${filters.propertyType || "multifamily"} in ${filters.market || "Austin"}`,
      results: [
        {
          metric: "Market Vacancy",
          value: "4.5%",
          trend: "stable",
          yoyChange: "+0.2%",
        },
        {
          metric: "Avg Asking Rent",
          value: "$1,725/mo",
          trend: "increasing",
          yoyChange: "+3.1%",
        },
        {
          metric: "Net Absorption",
          value: "2,450 units",
          trend: "positive",
          period: "trailing 12 months",
        },
        {
          metric: "Under Construction",
          value: "8,200 units",
          trend: "decreasing",
          period: "as of Q4 2025",
        },
      ],
    }),
    lending_benchmarks: (filters) => ({
      queryDescription: `Lending benchmarks for ${filters.propertyType || "multifamily"} in ${filters.market || "Colorado"}`,
      results: [
        {
          lenderType: "Agency (Fannie/Freddie)",
          maxLTV: "75–80%",
          typicalLTV: "70–75%",
          minDSCR: "1.25x",
          rateRange: "5.25–5.75%",
          term: "7–12 yr",
          notes: "Supplemental loans may push total to 80% LTV",
          source: "CoStar Capital Markets",
        },
        {
          lenderType: "CMBS (Non-Agency)",
          maxLTV: "75%",
          typicalLTV: "65–75%",
          minDSCR: "1.25–1.30x",
          rateRange: "6.00–7.00%",
          term: "5–10 yr",
          notes: "Higher LTV at lower DSCR; max 75% for stabilized",
          source: "CoStar Capital Markets",
        },
        {
          lenderType: "Bank / Credit Union",
          maxLTV: "70–75%",
          typicalLTV: "65–70%",
          minDSCR: "1.20–1.30x",
          rateRange: "5.50–6.50%",
          term: "5–7 yr",
          notes: "Recourse typically required above 65% LTV",
          source: "CoStar Capital Markets",
        },
        {
          lenderType: "Bridge / Debt Fund",
          maxLTV: "75–80%",
          typicalLTV: "70–80%",
          minDSCR: "1.00–1.10x",
          rateRange: "7.00–9.00%",
          term: "2–3 yr + ext",
          notes: "Value-add / transitional; LTC basis common",
          source: "CoStar Capital Markets",
        },
        {
          lenderType: "HUD/FHA 223(f)",
          maxLTV: "85%",
          typicalLTV: "80–85%",
          minDSCR: "1.176x",
          rateRange: "5.00–5.50%",
          term: "35 yr",
          notes: "Highest leverage; long timeline to close",
          source: "CoStar Capital Markets",
        },
      ],
    }),
  },
  yardi: {
    rent_roll: (filters) => ({
      queryDescription: `Rent roll data for ${filters.property || "portfolio"} in ${filters.market || "Austin"}`,
      results: [
        {
          unitType: "1BR",
          count: 120,
          avgRent: "$1,450",
          marketRent: "$1,520",
          lossToLease: "4.6%",
        },
        {
          unitType: "2BR",
          count: 80,
          avgRent: "$1,850",
          marketRent: "$1,920",
          lossToLease: "3.6%",
        },
        {
          unitType: "Studio",
          count: 40,
          avgRent: "$1,100",
          marketRent: "$1,150",
          lossToLease: "4.3%",
        },
      ],
    }),
    financials: (filters) => ({
      queryDescription: `Financial summary for ${filters.property || "portfolio"}`,
      results: [
        {
          lineItem: "Effective Gross Income",
          actual: "$4,250,000",
          budget: "$4,400,000",
          variance: "-3.4%",
        },
        {
          lineItem: "Total Operating Expenses",
          actual: "$1,680,000",
          budget: "$1,720,000",
          variance: "-2.3%",
        },
        {
          lineItem: "Net Operating Income",
          actual: "$2,570,000",
          budget: "$2,680,000",
          variance: "-4.1%",
        },
      ],
    }),
    lending_benchmarks: (filters) => ({
      queryDescription: `Lending benchmark data for ${filters.propertyType || "multifamily"} in ${filters.market || "Colorado"}`,
      results: [
        {
          metric: "Avg Senior LTV (Stabilized)",
          value: "68%",
          range: "60–75%",
          sample: "Q4 2025 originations",
          source: "Yardi Matrix Lending",
        },
        {
          metric: "Avg Senior LTV (Value-Add)",
          value: "72%",
          range: "65–80%",
          sample: "Q4 2025 originations",
          source: "Yardi Matrix Lending",
        },
        {
          metric: "Avg DSCR (Stabilized)",
          value: "1.32x",
          range: "1.20–1.50x",
          sample: "Q4 2025 originations",
          source: "Yardi Matrix Lending",
        },
        {
          metric: "Avg Interest Rate (Fixed)",
          value: "5.85%",
          range: "5.25–6.75%",
          sample: "Q4 2025 originations",
          source: "Yardi Matrix Lending",
        },
      ],
    }),
  },
  realpage: {
    market_survey: (filters) => ({
      queryDescription: `Market survey for ${filters.propertyType || "multifamily"} in ${filters.market || "Austin"}`,
      results: [
        {
          metric: "Effective Rent Growth",
          value: "2.8%",
          compSet: "Class A",
          period: "YoY",
        },
        {
          metric: "Occupancy",
          value: "94.5%",
          compSet: "Class A",
          period: "Current",
        },
        {
          metric: "Concessions",
          value: "0.5 months",
          compSet: "Class A",
          period: "Current",
        },
      ],
    }),
  },
  argus: {
    cash_flow: (filters) => ({
      queryDescription: `Cash flow projection for ${filters.property || "subject property"}`,
      results: [
        { year: 1, noi: "$2,570,000", cashFlow: "$1,420,000", dscr: "1.35x" },
        { year: 2, noi: "$2,645,000", cashFlow: "$1,495,000", dscr: "1.39x" },
        { year: 3, noi: "$2,720,000", cashFlow: "$1,570,000", dscr: "1.43x" },
      ],
    }),
  },
  trepp: {
    cmbs_loan_comps: (filters) => ({
      queryDescription: `CMBS loan comps for ${filters.propertyType || "multifamily"} in ${filters.market || "Colorado"}`,
      results: [
        {
          deal: "BENCHMARK 2025-B42",
          property: "Pinnacle at Cherry Creek",
          market: filters.market || "Denver CBD",
          loanAmount: "$18,500,000",
          ltv: "72.0%",
          dscr: "1.28x",
          rate: "6.25%",
          term: "10 yr",
          originationDate: "2025-Q3",
          source: "Trepp CMBS Analytics",
        },
        {
          deal: "JPMCC 2025-FL23",
          property: "The Residences at RiNo",
          market: filters.market || "Denver NE",
          loanAmount: "$24,000,000",
          ltv: "74.5%",
          dscr: "1.22x",
          rate: "6.50%",
          term: "5 yr + 1+1 ext",
          originationDate: "2025-Q2",
          source: "Trepp CMBS Analytics",
        },
        {
          deal: "WFCM 2024-C64",
          property: "Hilltop Estates",
          market: filters.market || "Colorado Springs",
          loanAmount: "$12,800,000",
          ltv: "68.0%",
          dscr: "1.35x",
          rate: "5.90%",
          term: "10 yr",
          originationDate: "2024-Q4",
          source: "Trepp CMBS Analytics",
        },
      ],
    }),
    leverage_norms: (filters) => ({
      queryDescription: `CMBS leverage norms for ${filters.propertyType || "multifamily"} nationwide (2024–2025)`,
      results: [
        {
          segment: "Multifamily Stabilized",
          avgLTV: "69.2%",
          medianLTV: "70.0%",
          p25_LTV: "64.0%",
          p75_LTV: "74.5%",
          avgDSCR: "1.34x",
          sample: "1,842 loans",
          period: "2024-Q1 to 2025-Q4",
          source: "Trepp CMBS Analytics",
        },
        {
          segment: "Multifamily Value-Add / Transitional",
          avgLTV: "73.8%",
          medianLTV: "75.0%",
          p25_LTV: "68.0%",
          p75_LTV: "78.0%",
          avgDSCR: "1.15x",
          sample: "684 loans",
          period: "2024-Q1 to 2025-Q4",
          source: "Trepp CMBS Analytics",
        },
      ],
    }),
  },
};

export const queryExternalDatabaseTool = defineTool({
  name: "query_external_database",
  label: "Query External Database",
  description:
    "Query synthetic CRE fixtures from an enabled demo data source. " +
    "Returns simulated market data, comps, and analytics for evaluating the workflow. " +
    "This tool does not connect to any third-party platform.",
  parameters: Type.Object({
    database: Type.String({
      description:
        'Platform to query: "costar", "yardi", "realpage", or "argus"',
    }),
    queryType: Type.String({
      description:
        'Type of query: "vacancy_comps", "rent_comps", "cap_rate_comps", "market_analytics", "rent_roll", "financials", "market_survey", "cash_flow"',
    }),
    filters: Type.Record(Type.String(), Type.String(), {
      description:
        'Query filters (e.g., { "market": "Austin", "propertyType": "multifamily" })',
    }),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation of the query (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const dbLower = params.database.toLowerCase();

    if (!isDatabaseConnected(dbLower)) {
      const sources = getConnectedDatabases();
      const connectedNames = sources
        .filter((s) => s.enabled)
        .map((s) => s.displayName)
        .join(", ");

      return toolError(
        `${params.database} is not connected. ` +
          (connectedNames
            ? `Currently connected: ${connectedNames}. `
            : "No databases are connected. ") +
          "Ask the user to enable a demo source via Settings > Data.",
      );
    }

    const dbMock = MOCK_DATA[dbLower];
    if (!dbMock) {
      return toolError(
        `Unknown database: ${params.database}. Supported: costar, yardi, realpage, argus.`,
      );
    }

    const queryFn = dbMock[params.queryType];
    if (!queryFn) {
      const available = Object.keys(dbMock).join(", ");
      return toolError(
        `Query type "${params.queryType}" not available for ${params.database}. Available: ${available}.`,
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 800 + Math.random() * 400),
    );

    const { results, queryDescription } = queryFn(params.filters);

    return toolSuccess({
      database: params.database,
      queryType: params.queryType,
      queryDescription,
      results,
      resultCount: results.length,
      sourceRef: {
        type: "database",
        database: dbLower,
        queryId: `mock-${dbLower}-${Date.now()}`,
        displayName: `${params.database} — ${queryDescription}`,
      },
      isMock: true,
      disclaimer: "Simulated data for demo purposes",
      source: "external_db",
    });
  },
});
