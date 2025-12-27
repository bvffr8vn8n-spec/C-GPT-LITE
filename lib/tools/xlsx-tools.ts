import { tool } from "ai";
import { z } from "zod";
import * as tableManager from "@/lib/xlsx/table-manager";

/**
 * Server-side tools для работы с XLSX таблицей.
 */
export const xlsxTools = {
  getRange: tool({
    description: "Read a range of cells from the XLSX table. Returns the data as a 2D array. Use this when user asks to see table data or read specific cells.",
    inputSchema: z.object({
      sheet: z.string().optional().describe("Sheet name (e.g., 'Sheet1'). Default: 'Sheet1'"),
      from: z.string().optional().describe("Starting cell address (e.g., 'A1'). Default: 'A1'"),
      to: z.string().optional().describe("Ending cell address (e.g., 'B3'). Default: 'H30'"),
    }),
    outputSchema: z.object({
      sheet: z.string(),
      range: z.string(),
      data: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
      headers: z.array(z.string()).optional(),
    }),
    execute: async ({ sheet, from, to }) => {
      try {
        // ШАГ 3: Дефолты для пустых параметров
        const actualSheet = sheet || "Sheet1";
        const actualFrom = from || "A1";
        const actualTo = to || "H30";
        
        console.log("🔵 [xlsx/getRange] Параметры:", { sheet: actualSheet, from: actualFrom, to: actualTo });
        
        return tableManager.getRange(actualSheet, actualFrom, actualTo);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read range: ${errorMessage}`);
      }
    },
  }),

  updateCell: tool({
    description: "Update a cell value in the XLSX table. This is a dangerous action that requires confirmation. DO NOT call this directly - first call requestDangerousActionConfirmation, then call performDangerousAction with action='updateXlsxCell'.",
    inputSchema: z.object({
      sheet: z.string().optional().describe("Sheet name (e.g., 'Sheet1'). Default: 'Sheet1'"),
      cell: z.string().describe("Cell address (e.g., 'A1')"),
      value: z.union([z.string(), z.number()]).describe("New value for the cell"),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ sheet, cell, value }) => {
      try {
        // ШАГ 3: Дефолт для sheet
        const actualSheet = sheet || "Sheet1";
        console.log("🔵 [xlsx/updateCell] Параметры:", { sheet: actualSheet, cell, value });
        
        tableManager.updateCell(actualSheet, cell, value);
        return {
          ok: true,
          message: `Cell ${actualSheet}!${cell} updated to ${value}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: `Failed to update cell: ${errorMessage}`,
        };
      }
    },
  }),

  explainFormula: tool({
    description: "Get and explain a formula from a cell in the XLSX table. Use this when user asks about formulas or calculations.",
    inputSchema: z.object({
      sheet: z.string().optional().describe("Sheet name (e.g., 'Sheet1'). Default: 'Sheet1'"),
      cell: z.string().describe("Cell address (e.g., 'D4')"),
    }),
    outputSchema: z.object({
      hasFormula: z.boolean(),
      formula: z.string().nullable(),
      value: z.union([z.string(), z.number(), z.null()]),
      explanation: z.string(),
    }),
    execute: async ({ sheet, cell }) => {
      try {
        // ШАГ 3: Дефолт для sheet
        const actualSheet = sheet || "Sheet1";
        console.log("🔵 [xlsx/explainFormula] Параметры:", { sheet: actualSheet, cell });
        
        const formula = tableManager.getFormula(actualSheet, cell);
        const range = tableManager.getRange(actualSheet, cell, cell);
        const value = range.data[0]?.[0] ?? null;
        
        if (formula) {
          return {
            hasFormula: true,
            formula,
            value,
            explanation: `Cell ${actualSheet}!${cell} contains formula: ${formula}. This formula calculates the value: ${value}`,
          };
        } else {
          return {
            hasFormula: false,
            formula: null,
            value,
            explanation: `Cell ${actualSheet}!${cell} does not contain a formula. Current value: ${value}`,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to explain formula: ${errorMessage}`);
      }
    },
  }),

  getSheets: tool({
    description: "Get list of all sheet names in the XLSX file. Use this to know which sheets are available.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      sheets: z.array(z.string()),
    }),
    execute: async () => {
      try {
        const sheets = tableManager.getSheets();
        return { sheets };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get sheets: ${errorMessage}`);
      }
    },
  }),
};

