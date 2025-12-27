import { tool } from "ai";
import { z } from "zod";

/**
 * Client-side tools для Generative UI.
 * Эти tools не имеют execute функции - они выполняются на клиенте через UI.
 */
export const chatTools = {
  askForConfirmation: tool({
    description: "Ask user for confirmation before performing an action. Use this when you need explicit user approval.",
    inputSchema: z.object({
      message: z.string().describe("The confirmation message to show to the user"),
    }),
    outputSchema: z.object({
      confirmed: z.enum(["confirmed", "denied"]).describe("User response: 'confirmed' or 'denied'"),
    }),
    // Client-side tool - no execute function
  }),

  getLocation: tool({
    description: "Get user's current location (city). Always ask for confirmation before using this tool.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      city: z.string().describe("The user's current city"),
    }),
    // Client-side tool - no execute function
  }),

  requestDangerousActionConfirmation: tool({
    description: "Request user confirmation before performing a dangerous action (delete/update). This tool only shows UI and does NOT perform the action. After user confirms, call performDangerousAction tool.",
    inputSchema: z.object({
      action: z.enum(["deleteThread", "deleteMessage", "updateMessage", "updateXlsxCell"]).describe("Type of action to confirm"),
      targetId: z.string().describe("ID of the thread or message to act upon, or cell address for updateXlsxCell (e.g., 'A1')"),
      threadId: z.string().optional().describe("Thread ID (required for deleteMessage and updateMessage)"),
      newContent: z.string().optional().describe("New content for updateMessage action, or sheet name for updateXlsxCell"),
      xlsxValue: z.union([z.string(), z.number()]).optional().describe("New value for XLSX cell (required for updateXlsxCell)"),
      question: z.string().describe("The confirmation question to show to the user (e.g., 'Вы уверены, что хотите удалить тред X?')"),
    }),
    outputSchema: z.object({
      decision: z.enum(["yes", "no"]).describe("User decision: 'yes' to proceed, 'no' to cancel"),
    }),
    // Client-side tool - no execute function
  }),

  openTable: tool({
    description: "Open a table UI component to display data. Use this after getting table data (e.g., from getThreadMessagesTable) to show it in a user-friendly table format.",
    inputSchema: z.object({
      title: z.string().describe("Table title (e.g., 'Messages in thread')"),
      threadId: z.string().describe("Thread ID for the table context"),
    }),
    outputSchema: z.object({
      opened: z.boolean().describe("Whether the table was opened successfully"),
    }),
    // Client-side tool - no execute function
  }),
};

