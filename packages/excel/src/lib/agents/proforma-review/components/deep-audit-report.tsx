import {
  AlertTriangle,
  CheckCircle,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";
import type { SourceRef } from "../audit-cell-registry";

interface Finding {
  source: "local_history" | "web_search" | "external_db";
  sourceLabel: string;
  sourceRef: SourceRef;
  dataPoints: { label: string; value: string }[];
  summary: string;
  isMock?: boolean;
  disclaimer?: string;
  blocked?: boolean;
  actionRequired?: string;
}

interface DeepAuditResult {
  targetRange: string;
  targetLabel: string;
  targetValue: string;
  findings: Finding[];
  verdict:
    | "within_range"
    | "above_market"
    | "below_market"
    | "insufficient_data";
  verdictExplanation: string;
}

const VERDICT_CONFIG: Record<
  string,
  { label: string; className: string; Icon: typeof CheckCircle }
> = {
  within_range: {
    label: "Within Range",
    className: "text-green-500 bg-green-500/10",
    Icon: CheckCircle,
  },
  above_market: {
    label: "Above Market",
    className: "text-amber-500 bg-amber-500/10",
    Icon: TrendingUp,
  },
  below_market: {
    label: "Below Market",
    className: "text-amber-500 bg-amber-500/10",
    Icon: TrendingDown,
  },
  insufficient_data: {
    label: "Insufficient Data",
    className: "text-blue-400 bg-blue-400/10",
    Icon: FileText,
  },
};

const SOURCE_ICONS: Record<string, typeof Globe> = {
  local_history: FileText,
  web_search: Globe,
  external_db: Database,
};

function SourceLink({ sourceRef }: { sourceRef: SourceRef }) {
  if (sourceRef.type === "web_url") {
    return (
      <a
        href={sourceRef.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] text-(--chat-accent) hover:underline"
      >
        <ExternalLink size={9} />
        {sourceRef.displayName}
        {sourceRef.section && (
          <span className="text-(--chat-text-muted)">
            ({sourceRef.section})
          </span>
        )}
      </a>
    );
  }

  if (sourceRef.type === "local_file") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-(--chat-accent)">
        <FileText size={9} />
        {sourceRef.displayName}
        {sourceRef.section && (
          <span className="text-(--chat-text-muted)">
            ({sourceRef.section})
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-[10px] text-(--chat-accent)">
      <Database size={9} />
      {sourceRef.displayName}
    </span>
  );
}

function FindingSection({ finding }: { finding: Finding }) {
  const Icon = SOURCE_ICONS[finding.source] || Globe;

  return (
    <div className="flex flex-col gap-1.5 py-2 px-2 rounded hover:bg-(--chat-bg-secondary) transition-colors">
      <div className="flex items-center gap-2">
        <Icon size={12} className="text-(--chat-text-muted) shrink-0" />
        <span className="text-[11px] font-medium text-(--chat-text-primary)">
          {finding.sourceLabel}
        </span>
        {finding.isMock && (
          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
            <FlaskConical size={8} />
            Demo
          </span>
        )}
        {finding.blocked && (
          <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
            <AlertTriangle size={8} />
            Unavailable
          </span>
        )}
      </div>

      {finding.actionRequired && (
        <p className="ml-5 text-[10px] text-amber-500">
          {finding.actionRequired}
        </p>
      )}

      {finding.dataPoints.length > 0 && (
        <div className="ml-5 flex flex-col gap-0.5">
          {finding.dataPoints.map((dp, i) => (
            <div
              key={`${dp.label}-${i}`}
              className="flex items-center justify-between gap-2 text-[10px]"
            >
              <span className="text-(--chat-text-muted) truncate">
                {dp.label}
              </span>
              <span className="text-(--chat-text-primary) font-mono shrink-0">
                {dp.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="ml-5 text-[10px] text-(--chat-text-muted) italic">
        {finding.summary}
      </p>

      {finding.disclaimer && (
        <p className="ml-5 text-[9px] text-amber-500/70 italic">
          {finding.disclaimer}
        </p>
      )}

      <div className="ml-5">
        <SourceLink sourceRef={finding.sourceRef} />
      </div>
    </div>
  );
}

export function DeepAuditReport({
  result,
  expanded,
}: {
  result: string;
  expanded: boolean;
}) {
  const data = useMemo<DeepAuditResult | null>(() => {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  if (!data?.verdict) return null;

  const config =
    VERDICT_CONFIG[data.verdict] || VERDICT_CONFIG.insufficient_data;
  const { Icon } = config;

  if (!expanded) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] shrink-0">
        <Icon size={10} className={config.className.split(" ")[0]} />
        <span className="text-(--chat-text-primary)">
          {data.targetLabel} {data.targetValue}
        </span>
        <span className={config.className.split(" ")[0]}>— {config.label}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="font-mono text-(--chat-accent)">
          {data.targetRange}
        </span>
        <span className="text-(--chat-text-muted)">·</span>
        <span className="text-(--chat-text-primary)">{data.targetLabel}</span>
        <span className="font-mono text-(--chat-text-primary)">
          {data.targetValue}
        </span>
      </div>

      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${config.className}`}
      >
        <Icon size={12} />
        <span className="font-medium">{config.label}</span>
        <span className="text-[10px] opacity-80">
          — {data.verdictExplanation}
        </span>
      </div>

      {data.findings.length > 0 && (
        <div className="flex flex-col border border-(--chat-border) rounded mt-1 divide-y divide-(--chat-border)">
          {data.findings.map((finding, i) => (
            <FindingSection key={`${finding.source}-${i}`} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}
