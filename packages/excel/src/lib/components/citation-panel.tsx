import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  FileText,
  Globe,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useState } from "react";
import type {
  AuditCellData,
  SourceRef,
} from "../agents/proforma-review/audit-cell-registry";

const VERDICT_STYLE: Record<
  string,
  { color: string; Icon: typeof CheckCircle }
> = {
  within_range: { color: "text-green-500", Icon: CheckCircle },
  above_market: { color: "text-amber-500", Icon: TrendingUp },
  below_market: { color: "text-amber-500", Icon: TrendingDown },
  insufficient_data: { color: "text-blue-400", Icon: FileText },
};

const VERDICT_LABEL: Record<string, string> = {
  within_range: "Within Range",
  above_market: "Above Market",
  below_market: "Below Market",
  insufficient_data: "Insufficient Data",
};

function SourceRow({
  sourceRef,
  label,
}: {
  sourceRef: SourceRef;
  label: string;
}) {
  const handleClick = useCallback(() => {
    if (sourceRef.type === "web_url") {
      window.open(sourceRef.url, "_blank", "noopener,noreferrer");
    }
  }, [sourceRef]);

  const isClickable = sourceRef.type === "web_url";
  const Icon =
    sourceRef.type === "local_file"
      ? FileText
      : sourceRef.type === "web_url"
        ? Globe
        : Database;

  const section =
    sourceRef.type === "local_file"
      ? sourceRef.section
      : sourceRef.type === "web_url"
        ? sourceRef.section
        : undefined;

  return (
    <button
      type="button"
      onClick={isClickable ? handleClick : undefined}
      className={`flex items-center gap-1.5 py-1 px-1.5 rounded text-[10px] w-full text-left transition-colors ${
        isClickable
          ? "hover:bg-(--chat-bg) cursor-pointer text-(--chat-accent)"
          : "text-(--chat-text-secondary) cursor-default"
      }`}
    >
      <Icon size={10} className="shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
      {section && (
        <span className="text-(--chat-text-muted) shrink-0">({section})</span>
      )}
      {isClickable && <ExternalLink size={8} className="shrink-0 opacity-50" />}
    </button>
  );
}

export function CitationPanel({ data }: { data: AuditCellData }) {
  const [expanded, setExpanded] = useState(false);

  const style = VERDICT_STYLE[data.verdict] || VERDICT_STYLE.insufficient_data;
  const { Icon } = style;
  const verdictLabel = VERDICT_LABEL[data.verdict] || data.verdict;

  return (
    <div
      className="flex flex-col border-t border-(--chat-border) bg-(--chat-bg-secondary)"
      style={{ fontFamily: "var(--chat-font)" }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] hover:bg-(--chat-bg) transition-colors cursor-pointer w-full"
      >
        <Icon size={10} className={`shrink-0 ${style.color}`} />
        <span className="text-(--chat-text-primary) truncate">
          {data.targetLabel} {data.targetValue}
        </span>
        <span className={`shrink-0 ${style.color}`}>— {verdictLabel}</span>
        <span className="ml-auto shrink-0 text-(--chat-text-muted)">
          {data.sources.length} source{data.sources.length !== 1 ? "s" : ""}
        </span>
        {expanded ? (
          <ChevronDown
            size={10}
            className="shrink-0 text-(--chat-text-muted)"
          />
        ) : (
          <ChevronUp size={10} className="shrink-0 text-(--chat-text-muted)" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col px-2 pb-2 gap-0.5 max-h-40 overflow-y-auto">
          {data.sources.map((source, i) => (
            <SourceRow
              key={`${source.sourceLabel}-${i}`}
              sourceRef={source.sourceRef}
              label={source.sourceLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
