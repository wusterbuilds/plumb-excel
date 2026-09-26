import { Type } from "@sinclair/typebox";
import { getWorksheetById, modifyObject } from "../excel/api";
import { registerSnapshot } from "../snapshot-store";
import { defineTool, toolError, toolSuccess } from "./types";

/* global Excel */

interface SavedChartConfig {
  chartType: string;
  title: string;
  sourceData?: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

async function readChartConfig(
  sheetId: number,
  chartId: string,
): Promise<SavedChartConfig | null> {
  return Excel.run(async (context) => {
    const sheet = await getWorksheetById(context, sheetId);
    if (!sheet) return null;
    const chart = sheet.charts.getItem(chartId);
    chart.load("chartType,top,left,width,height");
    chart.title.load("text");
    await context.sync();
    return {
      chartType: chart.chartType as string,
      title: chart.title.text,
      top: chart.top,
      left: chart.left,
      width: chart.width,
      height: chart.height,
    };
  });
}

const PivotFieldSchema = Type.Object({
  field: Type.String(),
  summarizeBy: Type.Optional(
    Type.Union([
      Type.Literal("sum"),
      Type.Literal("count"),
      Type.Literal("average"),
      Type.Literal("max"),
      Type.Literal("min"),
    ]),
  ),
});

const PropertiesSchema = Type.Object({
  name: Type.Optional(Type.String()),
  source: Type.Optional(
    Type.String({ description: "Data source range, e.g. 'Sheet1!A1:D100'" }),
  ),
  range: Type.Optional(
    Type.String({ description: "Output location (pivot table top-left cell)" }),
  ),
  anchor: Type.Optional(
    Type.String({ description: "Chart placement (top-left cell)" }),
  ),
  rows: Type.Optional(Type.Array(Type.Object({ field: Type.String() }))),
  columns: Type.Optional(Type.Array(Type.Object({ field: Type.String() }))),
  values: Type.Optional(Type.Array(PivotFieldSchema)),
  title: Type.Optional(Type.String()),
  chartType: Type.Optional(
    Type.Union([
      Type.Literal("columnClustered"),
      Type.Literal("barClustered"),
      Type.Literal("line"),
      Type.Literal("pie"),
      Type.Literal("scatter"),
      Type.Literal("area"),
      Type.Literal("doughnut"),
    ]),
  ),
});

export const modifyObjectTool = defineTool({
  name: "modify_object",
  label: "Modify Object",
  description:
    "Create, update, or delete charts and pivot tables. " +
    "For charts, specify chartType, source, and anchor. " +
    "For pivot tables, specify source, range, rows, columns, and values.",
  parameters: Type.Object({
    operation: Type.Union(
      [Type.Literal("create"), Type.Literal("update"), Type.Literal("delete")],
      {
        description: "Operation to perform",
      },
    ),
    sheetId: Type.Number({ description: "The worksheet ID (1-based index)" }),
    objectType: Type.Union(
      [Type.Literal("pivotTable"), Type.Literal("chart")],
      { description: "Type of object" },
    ),
    id: Type.Optional(
      Type.String({ description: "Object ID (required for update/delete)" }),
    ),
    properties: Type.Optional(PropertiesSchema),
    explanation: Type.Optional(
      Type.String({
        description: "Brief explanation (max 50 chars)",
        maxLength: 50,
      }),
    ),
  }),
  dirtyTracking: {
    getRanges: (p) => [
      {
        sheetId: p.sheetId,
        range: p.properties?.range || p.properties?.anchor || "*",
      },
    ],
  },
  beforeExecute: async (toolCallId, params) => {
    const { operation, sheetId, objectType, id, properties } = params;

    const reapplyOriginal = async () => {
      await modifyObject({
        operation,
        sheetId,
        objectType,
        id,
        properties,
      });
    };

    if (objectType === "chart") {
      switch (operation) {
        case "update": {
          if (!id) break;
          const oldConfig = await readChartConfig(sheetId, id);
          if (!oldConfig) break;
          registerSnapshot({
            toolCallId,
            toolName: "modify_object",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              await modifyObject({
                operation: "update",
                sheetId,
                objectType: "chart",
                id,
                properties: {
                  chartType: oldConfig.chartType,
                  title: oldConfig.title,
                },
              });
            },
            reapply: reapplyOriginal,
          });
          break;
        }
        case "delete": {
          if (!id) break;
          const savedConfig = await readChartConfig(sheetId, id);
          if (!savedConfig) break;
          registerSnapshot({
            toolCallId,
            toolName: "modify_object",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              await modifyObject({
                operation: "create",
                sheetId,
                objectType: "chart",
                properties: {
                  chartType: savedConfig.chartType,
                  title: savedConfig.title,
                  source: savedConfig.sourceData,
                },
              });
            },
            reapply: reapplyOriginal,
          });
          break;
        }
      }
    } else if (objectType === "pivotTable") {
      switch (operation) {
        case "delete": {
          if (!id) break;
          if (properties?.source && properties?.range) {
            const savedProps = { ...properties };
            registerSnapshot({
              toolCallId,
              toolName: "modify_object",
              timestamp: Date.now(),
              state: "available",
              restore: async () => {
                await modifyObject({
                  operation: "create",
                  sheetId,
                  objectType: "pivotTable",
                  properties: savedProps,
                });
              },
              reapply: reapplyOriginal,
            });
          }
          break;
        }
      }
    }
  },
  execute: async (toolCallId, params) => {
    try {
      const result = await modifyObject({
        operation: params.operation,
        sheetId: params.sheetId,
        objectType: params.objectType,
        id: params.id,
        properties: params.properties,
      });

      if (params.operation === "create") {
        const newId = (result as { id?: string }).id;
        if (newId) {
          registerSnapshot({
            toolCallId,
            toolName: "modify_object",
            timestamp: Date.now(),
            state: "available",
            restore: async () => {
              await modifyObject({
                operation: "delete",
                sheetId: params.sheetId,
                objectType: params.objectType,
                id: newId,
              });
            },
            reapply: async () => {
              await modifyObject({
                operation: "create",
                sheetId: params.sheetId,
                objectType: params.objectType,
                properties: params.properties,
              });
            },
          });
        }
      }

      return toolSuccess(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error modifying object";
      return toolError(message);
    }
  },
});
