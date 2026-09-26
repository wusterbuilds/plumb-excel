import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useMemo } from "react";
import type { AuditFinding } from "../tools/audit-proforma";

interface AuditResult {
  sheetName: string;
  totalCellsAudited: number;
  summary: { errors: number; warnings: number; info: number };
  findings: AuditFinding[];
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "error":
      return <AlertCircle size={12} className="text-red-500 shrink-0" />;
    case "warning":
      return <AlertTriangle size={12} className="text-amber-500 shrink-0" />;
    case "info":
      return <Info size={12} className="text-blue-400 shrink-0" />;
    default:
      return <CheckCircle size={12} className="text-green-500 shrink-0" />;
  }
}

function FindingRow({ finding }: { finding: AuditFinding }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-(--chat-bg-secondary) transition-colors">
      <SeverityIcon severity={finding.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-(--chat-accent)">
            {finding.cell}
          </span>
          <span className="text-[10px] text-(--chat-text-muted) uppercase">
            {finding.category.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-[11px] text-(--chat-text-primary) mt-0.5">
          {finding.message}
        </p>
        {finding.suggestion && (
          <p className="text-[10px] text-(--chat-text-muted) mt-0.5 italic">
            {finding.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}

export function AuditReport({
  result,
  expanded,
}: {
  result: string;
  expanded: boolean;
}) {
  const data = useMemo<AuditResult | null>(() => {
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }, [result]);

  if (!data?.summary) return null;

  const { summary, findings } = data;
  const total = summary.errors + summary.warnings + summary.info;

  if (!expanded) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] shrink-0">
        {summary.errors > 0 && (
          <span className="text-red-500">
            {summary.errors} error{summary.errors !== 1 ? "s" : ""}
          </span>
        )}
        {summary.warnings > 0 && (
          <span className="text-amber-500">
            {summary.warnings} warning{summary.warnings !== 1 ? "s" : ""}
          </span>
        )}
        {summary.info > 0 && (
          <span className="text-blue-400">{summary.info} info</span>
        )}
        {total === 0 && (
          <span className="text-green-500 flex items-center gap-1">
            <CheckCircle size={10} /> All clear
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-3 py-1 text-[10px] text-(--chat-text-muted)">
        <span>{data.sheetName}</span>
        <span>{data.totalCellsAudited} cells audited</span>
      </div>

      <div className="flex gap-3 py-1">
        {summary.errors > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-red-500">
            <AlertCircle size={11} /> {summary.errors}
          </span>
        )}
        {summary.warnings > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-amber-500">
            <AlertTriangle size={11} /> {summary.warnings}
          </span>
        )}
        {summary.info > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-blue-400">
            <Info size={11} /> {summary.info}
          </span>
        )}
      </div>

      {findings.length > 0 && (
        <div className="flex flex-col border border-(--chat-border) rounded mt-1">
          {findings.map((finding, i) => (
            <FindingRow key={`${finding.cell}-${i}`} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}
