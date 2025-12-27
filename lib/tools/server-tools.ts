import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";

/**
 * Server-side tools для выполнения опасных операций.
 * Эти tools выполняются на сервере и реально изменяют данные в БД.
 */
export const serverTools = {
  getThreadMessagesTable: tool({
    description: "Get all messages from a thread as a table data structure. Use this to display messages in a table format.",
    inputSchema: z.object({
      threadId: z.string().describe("Thread ID to get messages from"),
    }),
    outputSchema: z.object({
      columns: z.array(z.string()).describe("Column names: ['id', 'role', 'content', 'created_at']"),
      rows: z.array(z.object({
        id: z.string(),
        role: z.string(),
        content: z.string(),
        created_at: z.number(),
      })).describe("Array of message rows"),
    }),
    execute: async ({ threadId }) => {
      try {
        const messages = db
          .query(`SELECT id, role, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC`)
          .all(threadId) as Array<{
            id: string;
            role: string;
            content: string;
            created_at: number;
          }>;

        return {
          columns: ["id", "role", "content", "created_at"],
          rows: messages,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          columns: ["id", "role", "content", "created_at"],
          rows: [],
        };
      }
    },
  }),

  performDangerousAction: tool({
    description: "Perform a dangerous action (delete/update) after user confirmation. This tool actually modifies the database. Only call this AFTER requestDangerousActionConfirmation returned decision='yes'.",
    inputSchema: z.object({
      action: z.enum(["deleteThread", "deleteMessage", "updateMessage", "updateXlsxCell"]).describe("Type of action to perform"),
      targetId: z.string().describe("ID of the thread or message to act upon, or cell address for updateXlsxCell (e.g., 'A1')"),
      threadId: z.string().optional().describe("Thread ID (required for deleteMessage and updateMessage)"),
      newContent: z.string().optional().describe("New content for updateMessage action, or sheet name for updateXlsxCell"),
      xlsxValue: z.union([z.string(), z.number()]).optional().describe("New value for XLSX cell (required for updateXlsxCell)"),
    }),
    outputSchema: z.object({
      ok: z.boolean().describe("Whether the operation succeeded"),
      message: z.string().describe("Result message (e.g., 'Thread deleted successfully' or error message)"),
      action: z.enum(["deleteThread", "deleteMessage", "updateMessage", "updateXlsxCell"]).describe("Type of action that was performed"),
      targetId: z.string().describe("ID of the thread or message that was acted upon"),
      threadId: z.string().optional().describe("Thread ID (if applicable)"),
      newContent: z.string().optional().describe("New content (for updateMessage action)"),
    }),
    execute: async ({ action, targetId, threadId, newContent, xlsxValue }) => {
      try {
        if (action === "deleteThread") {
          // Проверяем существование треда
          const existing = db.query(`SELECT id FROM threads WHERE id = ?`).get(targetId);
          if (!existing) {
            return {
              ok: false,
              message: `Thread with id ${targetId} not found`,
              action: "deleteThread",
              targetId,
            };
          }

          // Удаляем тред (каскадное удаление сообщений зависит от настроек БД)
          // Сначала удаляем все сообщения треда
          db.run(`DELETE FROM messages WHERE thread_id = ?`, [targetId]);
          // Затем удаляем сам тред
          db.run(`DELETE FROM threads WHERE id = ?`, [targetId]);

          return {
            ok: true,
            message: `Thread ${targetId} deleted successfully`,
            action: "deleteThread",
            targetId,
            threadId: targetId, // Для deleteThread threadId = targetId
          };
        }

        if (action === "deleteMessage") {
          if (!threadId) {
            return {
              ok: false,
              message: "threadId is required for deleteMessage action",
              action: "deleteMessage",
              targetId,
            };
          }

          // Проверяем существование сообщения
          const existing = db
            .query(`SELECT id FROM messages WHERE id = ? AND thread_id = ?`)
            .get(targetId, threadId);
          if (!existing) {
            // Пытаемся найти сообщение в других тредах для диагностики
            const inOtherThread = db
              .query(`SELECT thread_id FROM messages WHERE id = ?`)
              .get(targetId);
            
            let errorMsg = `Message with id "${targetId}" not found in thread "${threadId}".`;
            if (inOtherThread) {
              errorMsg += ` This message belongs to thread "${(inOtherThread as any).thread_id}".`;
            } else {
              errorMsg += ` This message ID does not exist in the database.`;
            }
            errorMsg += ` Please use a valid message ID from the current thread.`;
            
            return {
              ok: false,
              message: errorMsg,
              action: "deleteMessage",
              targetId,
              threadId,
            };
          }

          // Удаляем сообщение
          db.run(`DELETE FROM messages WHERE id = ?`, [targetId]);

          return {
            ok: true,
            message: `Message ${targetId} deleted successfully`,
            action: "deleteMessage",
            targetId,
            threadId,
          };
        }

        if (action === "updateMessage") {
          if (!threadId) {
            return {
              ok: false,
              message: "threadId is required for updateMessage action",
              action: "updateMessage",
              targetId,
            };
          }

          if (!newContent) {
            return {
              ok: false,
              message: "newContent is required for updateMessage action",
              action: "updateMessage",
              targetId,
              threadId,
            };
          }

          // Проверяем существование сообщения
          const existing = db
            .query(`SELECT id FROM messages WHERE id = ? AND thread_id = ?`)
            .get(targetId, threadId);
          if (!existing) {
            // Пытаемся найти сообщение в других тредах для диагностики
            const inOtherThread = db
              .query(`SELECT thread_id FROM messages WHERE id = ?`)
              .get(targetId);
            
            let errorMsg = `Message with id "${targetId}" not found in thread "${threadId}".`;
            if (inOtherThread) {
              errorMsg += ` This message belongs to thread "${(inOtherThread as any).thread_id}".`;
            } else {
              errorMsg += ` This message ID does not exist in the database.`;
            }
            errorMsg += ` Please use a valid message ID from the current thread.`;
            
            return {
              ok: false,
              message: errorMsg,
              action: "updateMessage",
              targetId,
              threadId,
            };
          }

          // Обновляем контент сообщения
          db.run(`UPDATE messages SET content = ? WHERE id = ?`, [newContent, targetId]);

          return {
            ok: true,
            message: `Message ${targetId} updated successfully`,
            action: "updateMessage",
            targetId,
            threadId,
            newContent,
          };
        }

        if (action === "updateXlsxCell") {
          if (!newContent) {
            return {
              ok: false,
              message: "newContent (sheet name) is required for updateXlsxCell action",
              action: "updateXlsxCell",
              targetId,
            };
          }

          if (xlsxValue === undefined) {
            return {
              ok: false,
              message: "xlsxValue is required for updateXlsxCell action",
              action: "updateXlsxCell",
              targetId,
              newContent,
            };
          }

          // Импортируем динамически, чтобы избежать проблем с зависимостями
          const tableManager = await import("@/lib/xlsx/table-manager");
          try {
            tableManager.updateCell(newContent, targetId, xlsxValue);
            return {
              ok: true,
              message: `XLSX cell ${newContent}!${targetId} updated successfully`,
              action: "updateXlsxCell",
              targetId,
              newContent,
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              ok: false,
              message: `Failed to update XLSX cell: ${errorMessage}`,
              action: "updateXlsxCell",
              targetId,
              newContent,
            };
          }
        }

        return {
          ok: false,
          message: `Unknown action: ${action}`,
          action: action as any,
          targetId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: `Error performing action: ${errorMessage}`,
          action: action as any,
          targetId,
          threadId,
          newContent,
        };
      }
    },
  }),
};

