import { tool } from "ai";
import { z } from "zod";

/**
 * Client-side tools для Generative UI.
 * Эти tools не имеют execute функции - они выполняются на клиенте через UI.
 */
export const chatTools = {
  askForConfirmation: tool({
    description: "Ask the user for general confirmation on any question. This tool shows a UI card with a question and Yes/No buttons. Use this for any non-dangerous confirmation requests. After receiving the result (yes/no), you MUST respond with text: if 'yes' → 'Ок, подтверждено.', if 'no' → 'Ок, отменено.'",
    inputSchema: z.object({
      message: z.string().describe("The confirmation question to show to the user (e.g., 'Do you want to proceed?', 'Подтвердите действие')"),
    }),
    outputSchema: z.string().describe("User confirmation result: 'yes' or 'no'"),
    // Client-side tool - no execute function (output comes via addToolOutput)
  }),

  requestDangerousActionConfirmation: tool({
    description: "Request user confirmation before performing a dangerous action (delete/update). IMPORTANT: For XLSX cell updates, DO NOT use this tool - use 'updateCell' tool instead. This tool is ONLY for deleteThread, deleteMessage, and updateMessage actions. This tool only shows UI and does NOT perform the action. After user confirms, call performDangerousAction tool.",
    inputSchema: z.object({
      action: z.enum(["deleteThread", "deleteMessage", "updateMessage"]).describe("Type of action to confirm. DO NOT use 'updateXlsxCell' - use 'updateCell' tool for XLSX updates instead."),
      targetId: z.string().describe("ID of the thread or message to act upon"),
      threadId: z.string().optional().describe("Thread ID (required for deleteMessage and updateMessage)"),
      newContent: z.string().optional().describe("New content for updateMessage action"),
      question: z.string().describe("The confirmation question to show to the user (e.g., 'Вы уверены, что хотите удалить тред X?')"),
    }),
    outputSchema: z.object({
      confirmed: z.boolean().describe("User confirmation: true to proceed, false to cancel"),
      pending: z.boolean().optional().describe("If true, indicates this is a pending result waiting for user input"),
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

  getLocation: tool({
    description: "Request user permission to access their location (geolocation). This tool shows a UI card asking for permission to get the user's current location. After receiving permission (yes/no), if 'yes' the location will be retrieved and returned with coordinates and city name. If 'no', the request is cancelled. IMPORTANT: After receiving the result, you MUST respond with text: if 'yes' → 'Ок, разрешение получено. Вы находитесь в [city]. Координаты: широта [latitude], долгота [longitude].', if 'no' → 'Ок, доступ к местоположению отклонён.'",
    inputSchema: z.object({
      reason: z.string().optional().describe("Optional reason for requesting location (e.g., 'to find nearby restaurants', 'для поиска ближайших кафе')"),
    }),
    outputSchema: z.union([
      z.object({
        allowed: z.literal(true),
        latitude: z.number().describe("User's latitude in decimal degrees"),
        longitude: z.number().describe("User's longitude in decimal degrees"),
        accuracy: z.number().optional().describe("Accuracy of the location in meters"),
        city: z.string().optional().describe("City name determined from coordinates via reverse geocoding"),
        address: z.string().optional().describe("Full address determined from coordinates"),
      }),
      z.object({
        allowed: z.literal(false),
        reason: z.string().optional().describe("Reason for denial (e.g., 'user denied', 'permission denied', 'timeout')"),
      }),
    ]).describe("Location permission result: either allowed with coordinates and city, or denied"),
    // Client-side tool - no execute function (output comes via addToolOutput)
  }),
};

