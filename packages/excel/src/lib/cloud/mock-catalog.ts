import type { ConnectorInfo } from "./types";

// These entries exercise the connector UX with local synthetic fixtures only.
// They never authenticate to or query a third-party service.
export const MOCK_CONNECTORS: ConnectorInfo[] = [
  {
    id: "yardi",
    name: "Property system demo",
    description: "Simulated property, accounting, and lease data",
    authType: "credentials",
    authFields: [],
    tools: [
      "search_properties",
      "get_rent_roll",
      "get_financials",
      "get_lease_data",
    ],
    status: "beta",
  },
  {
    id: "costar",
    name: "Market data demo",
    description: "Simulated market analytics, comps, and valuations",
    authType: "credentials",
    authFields: [],
    tools: [
      "search_comps",
      "get_market_analytics",
      "get_property_valuation",
      "get_submarket_data",
    ],
    status: "beta",
  },
  {
    id: "realpage",
    name: "Revenue system demo",
    description: "Simulated revenue management and market intelligence",
    authType: "credentials",
    authFields: [],
    tools: ["get_revenue_data", "get_market_survey", "get_pricing_recs"],
    status: "beta",
  },
  {
    id: "argus",
    name: "Valuation system demo",
    description: "Simulated cash-flow projections and valuation models",
    authType: "credentials",
    authFields: [],
    tools: [
      "get_cash_flow_projection",
      "get_valuation",
      "get_scenario_analysis",
    ],
    status: "beta",
  },
];
