import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Static, TObject } from "@sinclair/typebox";
import type { DirtyRange } from "../dirty-tracker";
import { hasSnapshot } from "../snapshot-store";

export type ToolResult = AgentToolResult<undefined>;

export interface DirtyTrackingConfig<T> {
  getRanges: (params: T, result?: unknown) => DirtyRange[];
}

interface ToolConfig<T extends TObject> {
  name: string;
  label: string;
  description: string;
  parameters: T;
  execute: (
    toolCallId: string,
    params: Static<T>,
    signal?: AbortSignal,
  ) => Promise<ToolResult>;
  dirtyTracking?: DirtyTrackingConfig<Static<T>>;
  beforeExecute?: (toolCallId: string, params: Static<T>) => Promise<void>;
}

export function defineTool<T extends TObject>(
  config: ToolConfig<T>,
): AgentTool {
  if (!config.dirtyTracking && !config.beforeExecute) {
    return config as unknown as AgentTool;
  }

  const { dirtyTracking, beforeExecute, execute, ...rest } = config;

  const wrappedExecute = async (
    toolCallId: string,
    params: Static<T>,
    signal?: AbortSignal,
  ): Promise<ToolResult> => {
    if (beforeExecute) {
      try {
        await beforeExecute(toolCallId, params);
      } catch {
        // Snapshot capture failure should not block tool execution
      }
    }

    const result = await execute(toolCallId, params, signal);
    const first = result.content[0];
    if (!first || first.type !== "text") return result;
    const text = first.text;

    try {
      const parsed = JSON.parse(text);
      if (parsed.error) return result;

      if (dirtyTracking) {
        const dirtyRanges = dirtyTracking.getRanges(params, parsed);
        if (dirtyRanges.length > 0) {
          parsed._dirtyRanges = dirtyRanges;
        }
      }

      if (hasSnapshot(toolCallId)) {
        parsed._hasSnapshot = true;
      }

      if (parsed._dirtyRanges || parsed._hasSnapshot) {
        return {
          content: [{ type: "text", text: JSON.stringify(parsed) }],
          details: undefined,
        };
      }
    } catch {
      // Invalid JSON, return as-is
    }
    return result;
  };

  return { ...rest, execute: wrappedExecute } as unknown as AgentTool;
}

export function toolSuccess(data: unknown): ToolResult {
  const result =
    typeof data === "object" && data !== null ? { ...data } : { result: data };
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    details: undefined,
  };
}

export function toolError(message: string): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
    details: undefined,
  };
}

export function toolText(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    details: undefined,
  };
}
