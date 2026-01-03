import { tool } from "ai";
import { z } from "zod";
import * as tableManager from "@/lib/xlsx/table-manager";
import { extractDependencies } from "@/lib/xlsx/formula-parser";
import { calculateFormula } from "@/lib/xlsx/formula-calculator";

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
      formulas: z.array(z.array(z.union([z.string(), z.null()]))).optional(), // Матрица формул
    }),
    execute: async ({ sheet, from, to }) => {
      try {
        const actualSheet = sheet || "Sheet1";
        
        // ШАГ E: Если from/to не указаны, используем detectUsedRange
        let actualFrom = from;
        let actualTo = to;
        
        if (!actualFrom || !actualTo) {
          try {
            const usedRange = tableManager.detectUsedRange(actualSheet);
            if (usedRange) {
              actualFrom = actualFrom || usedRange.from;
              actualTo = actualTo || usedRange.to;
              console.log("🔵 [xlsx/getRange] Используем detectUsedRange:", usedRange);
            } else {
              // Лист пустой, используем дефолты
              actualFrom = actualFrom || "A1";
              actualTo = actualTo || "D10";
            }
          } catch (e) {
            // Если detectUsedRange не сработал, используем дефолты
            actualFrom = actualFrom || "A1";
            actualTo = actualTo || "D10";
          }
        }
        
        console.log("🔵 [xlsx/getRange] Параметры:", { sheet: actualSheet, from: actualFrom, to: actualTo });
        
        return tableManager.getRange(actualSheet, actualFrom, actualTo);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read range: ${errorMessage}`);
      }
    },
  }),

  updateCell: tool({
    description: "Update a cell value in the XLSX table. This is a dangerous action that requires user confirmation. When called, this tool returns a confirmation request - it does NOT write to the file immediately. The user must confirm via UI before the actual write happens.",
    inputSchema: z.object({
      sheet: z.string().optional().describe("Sheet name (e.g., 'Sheet1'). Default: 'Sheet1'"),
      cell: z.string().describe("Cell address (e.g., 'A1')"),
      value: z.union([z.string(), z.number()]).describe("New value for the cell"),
    }),
    outputSchema: z.object({
      status: z.enum(["needs_confirmation", "error"]).describe("Status of the operation"),
      confirmationId: z.string().optional().describe("Unique ID for this confirmation request"),
      action: z.string().optional().describe("Action type: 'updateXlsxCell'"),
      sheet: z.string().optional().describe("Sheet name"),
      cell: z.string().optional().describe("Cell address"),
      value: z.union([z.string(), z.number()]).optional().describe("New value"),
      question: z.string().optional().describe("Confirmation question to show to the user"),
      error: z.string().optional().describe("Error message if status is 'error'"),
    }),
    execute: async ({ sheet, cell, value }) => {
      try {
        // FIX: НЕ записываем в файл сразу, возвращаем confirmation request
        const actualSheet = sheet || "Sheet1";
        const confirmationId = `confirm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const question = `Изменить ячейку ${actualSheet}!${cell} на значение: ${value}?`;
        
        console.log("🔵 [xlsx/updateCell] Запрос на изменение ячейки (требуется подтверждение):", {
          sheet: actualSheet,
          cell,
          value,
          confirmationId,
        });
        
        // Возвращаем confirmation request - это закрывает tool-call и предотвращает "No tool output found"
        return {
          status: "needs_confirmation",
          confirmationId,
          action: "updateXlsxCell",
          sheet: actualSheet,
          cell,
          value,
          question,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("❌ [xlsx/updateCell] Ошибка:", errorMessage);
        return {
          status: "error",
          error: `Failed to process update request: ${errorMessage}`,
        };
      }
    },
  }),

  explainFormula: tool({
    description: "Get and explain a formula from a cell in the XLSX table. Returns formula text, dependencies, computed value, and human-readable explanation. Use this when user asks about formulas or calculations.",
    inputSchema: z.object({
      sheet: z.string().optional().describe("Sheet name (e.g., 'Sheet1'). Default: 'Sheet1'"),
      cell: z.string().describe("Cell address (e.g., 'D4')"),
    }),
    outputSchema: z.object({
      cell: z.string().describe("Cell address (e.g., 'D4')"),
      formula: z.string().nullable().describe("Formula text as in Excel (e.g., '=SUM(B2:B5)'), or null if no formula"),
      dependsOn: z.array(z.string()).describe("List of cell references and ranges that this formula depends on (e.g., ['B2:B5'] or ['B2', 'C2'])"),
      values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).describe("Map of dependency values: { 'B2': 10, 'B3': 20, ... } or { 'B2:B5': [10, 20, 30, 40] }"),
      computed: z.union([z.string(), z.number(), z.null()]).describe("Computed value of the formula, or null if cannot be computed"),
      explanation: z.string().describe("Human-readable explanation of what the formula does"),
      supported: z.boolean().describe("Whether the formula is supported by our calculator"),
      warnings: z.array(z.string()).describe("Array of warning messages (e.g., ['Unsupported function: VLOOKUP'])"),
    }),
    execute: async ({ sheet, cell }) => {
      try {
        const actualSheet = sheet || "Sheet1";
        
        if (process.env.DEBUG_XLSX === "1") {
          console.log("🔵 [xlsx/explainFormula] Параметры:", { sheet: actualSheet, cell });
        }
        
        const formula = tableManager.getFormula(actualSheet, cell);
        const currentValue = tableManager.getCellValue(actualSheet, cell);
        
        // Если формулы нет
        if (!formula) {
          return {
            cell,
            formula: null,
            dependsOn: [],
            values: {},
            computed: null,
            explanation: `Ячейка ${actualSheet}!${cell} не содержит формулу. Текущее значение: ${currentValue !== null && currentValue !== undefined ? currentValue : "пусто"}`,
            supported: false,
            warnings: [],
          };
        }
        
        // Извлекаем зависимости
        const dependsOn = extractDependencies(formula);
        
        // Получаем значения зависимостей
        const values: Record<string, string | number | boolean | null> = {};
        for (const dep of dependsOn) {
          if (dep.includes(":")) {
            // Это диапазон
            try {
              const rangeValues = tableManager.getRangeValues(actualSheet, dep);
              values[dep] = rangeValues;
            } catch (error) {
              values[dep] = null;
            }
          } else {
            // Это одиночная ячейка
            values[dep] = tableManager.getCellValue(actualSheet, dep);
          }
        }
        
        // Пытаемся вычислить формулу
        let computed: string | number | null = null;
        let supported = true;
        const warnings: string[] = [];
        
        try {
          const workbook = tableManager.loadWorkbook();
          const worksheet = workbook.Sheets[actualSheet];
          computed = calculateFormula(formula, worksheet, cell);
          
          if (computed === null) {
            supported = false;
            warnings.push("Не удалось вычислить формулу");
          }
        } catch (error) {
          supported = false;
          const errorMsg = error instanceof Error ? error.message : String(error);
          warnings.push(`Ошибка вычисления: ${errorMsg}`);
        }
        
        // Проверяем поддержку функций
        const upperFormula = formula.toUpperCase();
        const unsupportedFunctions = ["VLOOKUP", "HLOOKUP", "INDEX", "MATCH", "IFERROR", "INDIRECT"];
        for (const func of unsupportedFunctions) {
          if (upperFormula.includes(func)) {
            supported = false;
            warnings.push(`Неподдерживаемая функция: ${func}`);
          }
        }
        
        // Формируем объяснение
        let explanation = `Ячейка ${actualSheet}!${cell} содержит формулу: ${formula}`;
        
        if (dependsOn.length > 0) {
          explanation += `. Зависит от: ${dependsOn.join(", ")}`;
        }
        
        // Добавляем объяснение по типу функции
        if (formula.toUpperCase().includes("СУММ") || formula.toUpperCase().includes("SUM")) {
          explanation += `. Суммирует значения`;
          if (dependsOn.length > 0) {
            const rangeDep = dependsOn.find(d => d.includes(":"));
            if (rangeDep) {
              const rangeValues = values[rangeDep];
              if (Array.isArray(rangeValues)) {
                const sum = rangeValues.reduce((acc: number, val: any) => {
                  const num = typeof val === "number" ? val : (parseFloat(String(val)) || 0);
                  return acc + num;
                }, 0);
                explanation += ` в диапазоне ${rangeDep}. Результат: ${sum}`;
              }
            }
          }
        } else if (formula.toUpperCase().includes("СРЗНАЧ") || formula.toUpperCase().includes("AVERAGE")) {
          explanation += `. Вычисляет среднее арифметическое`;
        } else if (formula.toUpperCase().includes("СЧЁТ") || formula.toUpperCase().includes("COUNT")) {
          explanation += `. Подсчитывает количество чисел`;
        } else if (dependsOn.length === 1 && !dependsOn[0].includes(":")) {
          explanation += `. Копирует значение из ячейки ${dependsOn[0]}`;
        } else if (dependsOn.length > 1) {
          explanation += `. Выполняет арифметические операции над значениями ячеек`;
        }
        
        if (computed !== null) {
          explanation += `. Вычисленное значение: ${computed}`;
        } else if (!supported) {
          explanation += `. Формула не может быть вычислена (не поддерживается или содержит ошибки)`;
        }
        
        if (process.env.DEBUG_XLSX === "1") {
          console.log("✅ [xlsx/explainFormula] Результат:", {
            cell,
            formula,
            dependsOn,
            computed,
            supported,
            warnings,
          });
        }
        
        return {
          cell,
          formula,
          dependsOn,
          values,
          computed,
          explanation,
          supported,
          warnings,
        };
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

  getUsedRange: tool({
    description: "Get the used range (actual filled cells) of a sheet. Returns the range from first to last filled cell.",
    inputSchema: z.object({
      sheet: z.string().optional().describe("Sheet name (e.g., 'Sheet1'). Default: 'Sheet1'"),
    }),
    outputSchema: z.object({
      sheet: z.string(),
      from: z.string(),
      to: z.string(),
    }),
    execute: async ({ sheet }) => {
      try {
        const actualSheet = sheet || "Sheet1";
        const usedRange = tableManager.getUsedRange(actualSheet);
        if (!usedRange) {
          return { sheet: actualSheet, from: "A1", to: "A1" };
        }
        return { sheet: actualSheet, ...usedRange };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get used range: ${errorMessage}`);
      }
    },
  }),

  logInvites: tool({
    description: "Send email invitations to a list of email addresses. IMPORTANT: Use this tool when user asks to 'send invitation', 'send invitations', 'отправить приглашение', 'отправить приглашения' or similar. This tool simulates sending invitations (for demonstration purposes, does not actually send emails). Always use this tool after extracting emails from a range using getRange. The tool returns a summary of sent invitations.",
    inputSchema: z.object({
      emails: z.array(z.string().email()).describe("Array of email addresses to send invitations to. Extract these from the data returned by getRange tool. The data is a 2D array: iterate through all rows and columns, filter valid email addresses (must contain '@' and '.' after '@'), and collect them into an array."),
      subject: z.string().optional().describe("Optional subject line for the invitation email"),
      message: z.string().optional().describe("Optional message body for the invitation email"),
    }),
    outputSchema: z.object({
      status: z.string().describe("Status of the operation (e.g., 'success')"),
      loggedEmailsCount: z.number().describe("Number of invitations logged (simulated)"),
      emails: z.array(z.string()).describe("List of email addresses that were processed"),
    }),
    execute: async ({ emails, subject, message }) => {
      try {
        // Симуляция отправки приглашений (логирование)
        console.log("📧 [logInvites] Симуляция отправки приглашений:");
        console.log("   Получатели:", emails.join(", "));
        if (subject) console.log("   Тема:", subject);
        if (message) console.log("   Сообщение:", message);
        
        // В реальном приложении здесь был бы вызов API для отправки email
        // Для демонстрации просто логируем и возвращаем результат
        
        return {
          status: "success",
          loggedEmailsCount: emails.length,
          emails,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to log invites: ${errorMessage}`);
      }
    },
  }),
};

