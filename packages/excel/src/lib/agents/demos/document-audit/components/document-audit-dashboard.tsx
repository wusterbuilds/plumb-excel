import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  FileWarning,
  TrendingDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuditFlag } from "../document-audit-store";
import { documentAuditStore } from "../document-audit-store";
import { AuditFlagCard } from "./audit-flag-card";

interface AuditResult {
  auditRunId: string;
  documentsAudited: Array<{ name: string; uploadDate?: string }>;
  proformaVersion: string;
  flags: AuditFlag[];
  summary: {
    criticalCount: number;
    warningCount: number;
    missingCount: number;
    noiImpact: string;
    valueImpact: string;
  };
  isHardcoded?: boolean;
}

export function DocumentAuditDashboard({
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

  const [, setTick] = useState(0);

  useEffect(() => {
    return documentAuditStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  if (!data?.flags) return null;

  const { summary, flags } = data;
  const resolutionSummary = documentAuditStore.getResolutionSummary();
  const allResolved = documentAuditStore.isAllResolved();
  const totalFlags = flags.length;

  if (!expanded) {
    if (allResolved) {
      return (
        <span className="flex items-center gap-1.5 text-[10px] shrink-0">
          <CheckCircle size={10} className="text-green-500" />
          <span className="text-green-500">
            All {totalFlags} flags reviewed
          </span>
          <span className="text-(--chat-text-muted)">
            {resolutionSummary.accepted} accepted
            {resolutionSummary.overridden > 0 &&
              ` · ${resolutionSummary.overridden} overridden`}
            {resolutionSummary.dismissed > 0 &&
              ` · ${resolutionSummary.dismissed} dismissed`}
          </span>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5 text-[10px] shrink-0">
        {summary.criticalCount > 0 && (
          <span className="text-red-500 flex items-center gap-0.5">
            <AlertCircle size={10} />
            {summary.criticalCount} critical
          </span>
        )}
        {summary.warningCount > 0 && (
          <span className="text-amber-500 flex items-center gap-0.5">
            <AlertTriangle size={10} />
            {summary.warningCount} warning
          </span>
        )}
        {summary.missingCount > 0 && (
          <span className="text-red-400 flex items-center gap-0.5">
            <FileWarning size={10} />
            {summary.missingCount} missing
          </span>
        )}
        <span className="text-(--chat-text-muted)">
          | NOI: {summary.noiImpact}
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-wrap items-center gap-3 py-1.5 text-[11px]">
        {summary.criticalCount > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <AlertCircle size={12} /> {summary.criticalCount} critical
          </span>
        )}
        {summary.warningCount > 0 && (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle size={12} /> {summary.warningCount} warning
          </span>
        )}
        {summary.missingCount > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <FileWarning size={12} /> {summary.missingCount} missing
          </span>
        )}
      </div>

      <div className="flex gap-4 py-1 px-2 bg-(--chat-bg-secondary) rounded text-[10px]">
        <div className="flex items-center gap-1 text-(--chat-text-muted)">
          <TrendingDown size={10} />
          <span>
            Estimated NOI impact: <strong>{summary.noiImpact}</strong>
          </span>
        </div>
        <div className="text-(--chat-text-muted)">
          Value impact: <strong>{summary.valueImpact}</strong>
        </div>
      </div>

      <div className="text-[10px] text-(--chat-text-muted)">
        Documents audited: {data.documentsAudited.map((d) => d.name).join(", ")}
      </div>

      <div className="flex flex-col gap-2">
        {flags.map((flag) => (
          <AuditFlagCard key={flag.id} flag={flag} />
        ))}
      </div>

      {allResolved && (
        <div className="flex items-center gap-2 py-2 px-3 bg-green-500/10 rounded text-[11px] text-green-500">
          <CheckCircle size={14} />
          <div>
            <span className="font-medium">All flags reviewed.</span>{" "}
            {resolutionSummary.accepted} accepted
            {resolutionSummary.overridden > 0 &&
              ` · ${resolutionSummary.overridden} overridden`}
            {resolutionSummary.dismissed > 0 &&
              ` · ${resolutionSummary.dismissed} dismissed`}
            . Pro forma updated.
          </div>
        </div>
      )}

      {!allResolved && resolutionSummary.pending < totalFlags && (
        <div className="text-[10px] text-(--chat-text-muted) py-1">
          {totalFlags - resolutionSummary.pending} of {totalFlags} flags
          reviewed. {resolutionSummary.pending} remaining.
        </div>
      )}
    </div>
  );
}
