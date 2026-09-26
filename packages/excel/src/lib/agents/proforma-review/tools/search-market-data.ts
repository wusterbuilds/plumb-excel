import {
  fetchWeb,
  loadSavedConfig,
  loadWebConfig,
  searchWeb,
} from "@office-agents/core";
import { Type } from "@sinclair/typebox";
import { defineTool, toolSuccess } from "../../../tools/types";

function getProxyUrl(): string | undefined {
  const config = loadSavedConfig();
  return config?.proxyUrl || undefined;
}

function buildSearchQuery(params: {
  query: string;
  propertyType?: string;
  market?: string;
  metric?: string;
}): string {
  const parts = [params.query];
  if (params.propertyType) parts.push(params.propertyType);
  if (params.market) parts.push(params.market);
  if (
    params.metric &&
    !params.query.toLowerCase().includes(params.metric.toLowerCase())
  ) {
    parts.push(params.metric);
  }
  parts.push("commercial real estate");
  return parts.join(" ");
}

function extractDataPoints(
  text: string,
  metric: string,
): { label: string; value: string }[] {
  const points: { label: string; value: string }[] = [];
  const lines = text.split("\n");
  const metricLower = metric.toLowerCase();

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!lower.includes(metricLower)) continue;

    const percentMatch = line.match(/([\d.]+)\s*%/);
    const dollarMatch = line.match(/\$\s*([\d,.]+)/);
    const numberMatch = line.match(/(\d+\.?\d*)\s*(bps|basis points)/i);

    if (percentMatch) {
      points.push({
        label: line.trim().slice(0, 80),
        value: `${percentMatch[1]}%`,
      });
    } else if (dollarMatch) {
      points.push({
        label: line.trim().slice(0, 80),
        value: `$${dollarMatch[1]}`,
      });
    } else if (numberMatch) {
      points.push({
        label: line.trim().slice(0, 80),
        value: `${numberMatch[1]} bps`,
      });
    }

    if (points.length >= 5) break;
  }

  return points;
}

export const searchMarketDataTool = defineTool({
  name: "search_market_data",
  label: "Search Market Data",
  description:
    "Search the web for commercial real estate market data, benchmarks, and comparable metrics. " +
    "Constructs CRE-specific queries, searches the web, and fetches top results to extract " +
    "relevant data points. Returns structured findings with source URLs.",
  parameters: Type.Object({
    query: Type.String({
      description:
        "Search query (e.g., 'Austin multifamily vacancy rate 2026')",
    }),
    propertyType: Type.Optional(
      Type.String({
        description:
          "Property type filter (e.g., 'multifamily', 'office', 'retail', 'industrial')",
      }),
    ),
    market: Type.Optional(
      Type.String({
        description: "Market or submarket (e.g., 'Austin CBD', 'Manhattan')",
      }),
    ),
    metric: Type.Optional(
      Type.String({
        description:
          "Specific metric to focus on (e.g., 'vacancy rate', 'cap rate', 'asking rent')",
      }),
    ),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation of the search (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const webConfig = loadWebConfig();
      const proxyUrl = getProxyUrl();
      const context = {
        proxyUrl,
        apiKeys: webConfig.apiKeys as Record<string, string | undefined>,
      };

      const searchQuery = buildSearchQuery(params);
      const searchResults = await searchWeb(
        searchQuery,
        { maxResults: 5 },
        context,
        webConfig.searchProvider,
      );

      if (searchResults.length === 0) {
        return toolSuccess({
          results: [],
          message: `No web results found for: ${searchQuery}`,
          source: "web_search",
        });
      }

      const metricToSearch = params.metric || params.query;
      const results: {
        source: string;
        url: string;
        excerpt: string;
        dataPoints: { label: string; value: string }[];
        sourceRef: {
          type: "web_url";
          url: string;
          section?: string;
          displayName: string;
        };
      }[] = [];

      const urlsToFetch = searchResults.slice(0, 3);

      for (const sr of urlsToFetch) {
        try {
          const fetched = await fetchWeb(
            sr.href,
            context,
            webConfig.fetchProvider,
          );

          if (fetched.kind !== "text") continue;

          const dataPoints = extractDataPoints(fetched.text, metricToSearch);
          const excerpt = `${fetched.text.slice(0, 300).replace(/\n+/g, " ").trim()}...`;

          results.push({
            source: sr.title,
            url: sr.href,
            excerpt,
            dataPoints,
            sourceRef: {
              type: "web_url",
              url: sr.href,
              section: dataPoints.length > 0 ? metricToSearch : undefined,
              displayName: fetched.title || sr.title,
            },
          });
        } catch {
          results.push({
            source: sr.title,
            url: sr.href,
            excerpt: sr.body,
            dataPoints: [],
            sourceRef: {
              type: "web_url",
              url: sr.href,
              displayName: sr.title,
            },
          });
        }
      }

      return toolSuccess({
        searchQuery,
        results,
        source: "web_search",
      });
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Unknown error searching market data";
      const isCors =
        reason.includes("CORS") ||
        reason.includes("proxy") ||
        reason.includes("Failed to fetch") ||
        reason.includes("NetworkError");
      return toolSuccess({
        blocked: true,
        reason: isCors
          ? "Web search blocked by CORS. Configure a proxy URL in Settings > LLM Configuration > CORS Proxy URL (e.g. https://localhost:8080)."
          : reason,
        actionRequired: isCors
          ? "Open Settings (gear icon) and set the CORS Proxy URL to enable web search."
          : undefined,
        results: [],
        source: "web_search",
      });
    }
  },
});
