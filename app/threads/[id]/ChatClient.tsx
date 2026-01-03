"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import TableMessage from "./TableMessage";
import EditMessageModal from "./EditMessageModal";
import MessagesTable from "./MessagesTable";
import SpreadsheetView from "./SpreadsheetView";
import {
  ConfirmationCard,
  DangerousActionConfirmationCard,
  DangerousActionResultCard,
  InvitationSentCard,
  MessageContextMenu,
  LocationPermissionCard,
  FormulaExplanationCard,
} from "./components";
import { getText, isToolPart, getToolName, trimSpreadsheetData } from "./utils";

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
};

// Утилиты и компоненты вынесены в отдельные файлы

// Компоненты вынесены в ./components/

export default function ChatClient({ threadId, initialMessages }: Props) {
  const router = useRouter();
  
  // ШАГ 5: Защита от рендера при отсутствии threadId
  if (!threadId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12, opacity: 0.5 }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 16 }}>Тред не найден</div>
      </div>
    );
  }

  const [text, setText] = useState("");
  const [localError, setLocalError] = useState("");
  // Защита от повторного применения результатов tool calls
  const appliedToolCalls = useRef(new Set<string>());
  // Защита от дублирования подтверждений - ШАГ 4
  const handledConfirmations = useRef(new Set<string>());
  // Ref для sendMessage чтобы использовать в useEffect без зависимостей
  const sendMessageRef = useRef<((message: { text: string }) => Promise<void>) | null>(null);
  // Ref для lastSpreadsheetContext
  const lastSpreadsheetContextRef = useRef<{ sheet: string; from: string; to: string } | null>(null);
  // Ref для input элемента для вставки меншонов в позицию курсора
  const inputRef = useRef<HTMLInputElement | null>(null);
  
  // FIX: Ref для отслеживания отправленных tool-results (для диагностики)
  const sentToolResults = useRef(new Set<string>());
  // Состояние для pending confirmations (toolCallId -> payload)
  const [pendingConfirm, setPendingConfirm] = useState<{
    toolCallId: string;
    payload: any;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    messageId: string;
    messageText: string;
    position: { x: number; y: number };
  } | null>(null);
  const [editModal, setEditModal] = useState<{
    messageId: string;
    messageText: string;
  } | null>(null);

  // Состояние для таблицы сообщений
  const [messagesTableData, setMessagesTableData] = useState<{
    title: string;
    threadId: string;
    columns: string[];
    rows: Array<{ id: string; role: string; content: string; created_at: number }>;
  } | null>(null);

  // Состояние для XLSX таблицы
  const [spreadsheetData, setSpreadsheetData] = useState<{
    sheet: string;
    range: string;
    data: Array<Array<string | number | null>>;
    headers?: string[];
    formulas?: Array<Array<string | null>>; // Матрица формул
  } | null>(null);
  
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);

  // ШАГ 2: Сохраняем последний контекст открытой таблицы
  const [lastSpreadsheetContext, setLastSpreadsheetContext] = useState<{
    sheet: string;
    from: string;
    to: string;
  } | null>(null);

  // FIX: Ref для addToolOutput (нужен для использования в onToolCall до объявления addToolOutput)
  // ПРИМЕЧАНИЕ: TypeScript типы требуют 'tool', но согласно документации AI SDK он не нужен
  // Используем 'as any' при вызове addToolOutput для обхода проверки типов
  const addToolOutputRef = useRef<((params: any) => void) | null>(null);

  // Убираем controlled режим: НЕ передаём messages: initialMessages в useChat
  // FIX: Используем ref для lastSpreadsheetContext в body, чтобы не пересоздавать transport
  const { messages, setMessages, sendMessage, status, error, addToolOutput, stop } = useChat({
    id: threadId,
    // initialMessages не поддерживается в useChat, используем useEffect для инициализации
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
    threadId,
        // ШАГ 2: Передаём последний контекст таблицы на сервер через функцию, чтобы использовать актуальное значение
        get spreadsheetContext() {
          return lastSpreadsheetContextRef.current;
        },
      },
    }),
    onError: (e: unknown) => {
      console.error("❌ [useChat] Error:", e);
      let errorMessage = e instanceof Error ? e.message : String(e);
      
      // Специальная обработка для "No tool output found" - это серверная ошибка
      // которая возникает когда tool-result теряется при конвертации/фильтрации на сервере
      if (errorMessage.includes("No tool output found") || errorMessage.includes("tool output found")) {
        console.error("❌ [useChat] КРИТИЧЕСКАЯ ОШИБКА: No tool output found - tool-result потерян на сервере!");
        console.error("❌ [useChat] Проверьте логи сервера: [debug] incoming assistant tool parts и [debug] model tool messages");
        errorMessage = "Ошибка: tool-result потерян при обработке на сервере. Проверьте консоль сервера для диагностики.";
      }
      // Проверка на отсутствие API ключа
      else if (errorMessage.includes("API key") || errorMessage.includes("OPENAI_API_KEY") || errorMessage.includes("не настроен")) {
        errorMessage = "OpenAI API ключ не настроен. Пожалуйста, добавьте ваш API ключ в файл .env.local";
      }
      // Улучшаем сообщение для rate limit ошибок
      else if (errorMessage.includes("rate_limit") || errorMessage.includes("Rate limit")) {
        // Пытаемся извлечь время ожидания из сообщения
        const retryMatch = errorMessage.match(/try again in ([\d.]+)([smh])/);
        if (retryMatch) {
          const value = parseFloat(retryMatch[1]);
          const unit = retryMatch[2];
          let timeStr = "";
          if (unit === "h") {
            const hours = Math.ceil(value);
            timeStr = `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'}`;
          } else if (unit === "m") {
            const minutes = Math.ceil(value);
            timeStr = `${minutes} ${minutes === 1 ? 'минуту' : minutes < 5 ? 'минуты' : 'минут'}`;
          } else {
            const seconds = Math.ceil(value);
            timeStr = `${seconds} ${seconds === 1 ? 'секунду' : seconds < 5 ? 'секунды' : 'секунд'}`;
          }
          errorMessage = `Превышен лимит запросов. Попробуйте снова через ${timeStr}.`;
        } else {
          errorMessage = "Превышен лимит запросов к OpenAI. Пожалуйста, подождите несколько минут и попробуйте снова.";
        }
      }
      // Проверка на неверный API ключ
      else if (errorMessage.includes("Invalid API key") || errorMessage.includes("Incorrect API key")) {
        errorMessage = "Неверный OpenAI API ключ. Пожалуйста, проверьте правильность ключа в файле .env.local";
      }
      // Проверка на ошибки парсинга потока
      else if (errorMessage.includes("Failed to parse") || errorMessage.includes("parse")) {
        errorMessage = "Ошибка при обработке ответа от сервера. Попробуйте отправить сообщение снова.";
      }
      // Общая ошибка
      else if (!errorMessage || errorMessage === "An error occurred") {
        // Пытаемся получить больше информации об ошибке
        console.error("❌ [useChat] Полная информация об ошибке:", {
          error: e,
          errorType: typeof e,
          errorConstructor: e?.constructor?.name,
          errorString: String(e),
          errorKeys: e && typeof e === 'object' ? Object.keys(e) : [],
        });
        errorMessage = "Произошла ошибка при отправке сообщения. Проверьте консоль браузера для деталей.";
      }
      
      console.error("❌ [useChat] Установка ошибки:", errorMessage);
      setLocalError(errorMessage);
    },
    onToolCall: async ({ toolCall }: any) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:180',message:'onToolCall entry',data:{toolName:toolCall?.toolName,toolCallId:toolCall?.toolCallId,dynamic:toolCall?.dynamic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // FIX: Проверяем dynamic tools ПЕРВЫМИ (согласно документации AI SDK)
      if (toolCall.dynamic) {
        console.log("🔧 [onToolCall] ❌ Dynamic tool, игнорируем");
        return;
      }

      const id = toolCall.toolCallId;
      const toolName = toolCall.toolName;
      
      console.log("🔧 [onToolCall] ════════════════════════════════════════");
      console.log("🔧 [onToolCall] Tool call получен:", {
        toolName,
        toolCallId: id,
        dynamic: toolCall.dynamic,
        timestamp: new Date().toISOString(),
        args: toolCall.input || toolCall.args ? JSON.stringify(toolCall.input || toolCall.args).substring(0, 200) : "no args",
        hasAddToolOutput: !!addToolOutput,
        hasAddToolOutputRef: !!addToolOutputRef.current,
      });
      console.log("🔧 [onToolCall] ════════════════════════════════════════");

      // FIX: UI tools (requestDangerousActionConfirmation, openTable, getThreadMessagesTable)
      // НЕ должны блокироваться по exists-check - они ВСЕГДА требуют tool-result
      const isUITool = toolName === "askForConfirmation" ||
                      toolName === "requestDangerousActionConfirmation" || 
                      toolName === "openTable" ||
                      toolName === "getThreadMessagesTable" ||
                      toolName === "getLocation";
      
      // Для UI tools НЕ проверяем exists - всегда обрабатываем
      // Для server tools проверяем существование (но не блокируем слишком агрессивно)
      if (!isUITool) {
        const exists = messagesRef.current.some((m) =>
          (m.parts ?? []).some((p: any) => 
            (p.type === "tool-call" || p.type?.startsWith("tool-")) && 
            (p.toolCallId === id || p.toolCallId === toolCall.toolCallId)
          )
        );
        
        if (!exists) {
          console.log("🔧 [onToolCall] ⚠️ Server tool-call уже не существует в messages, пропускаем:", id);
          return; // Tool-call удалён (смена треда/удаление сообщения), не вызываем addToolOutput
        }
      } else {
        console.log("🔧 [onToolCall] ✅ UI tool, пропускаем exists-check:", toolName);
      }

      try {

        // Обработка requestDangerousActionConfirmation - возвращаем pending результат сразу
        // чтобы избежать "No tool output found", но реальный результат будет когда пользователь подтвердит
        if (toolName === "requestDangerousActionConfirmation") {
          console.log("🔧 [onToolCall] ⏳ requestDangerousActionConfirmation получен:", {
            toolCallId: id,
            timestamp: new Date().toISOString(),
          });
          
          // FIX: В AI SDK v6 аргументы могут быть в toolCall.input или нужно найти part в messages
          const args = toolCall.input || toolCall.args || (() => {
            // Пытаемся найти part в текущих messages
            for (const m of messagesRef.current) {
              if (m.role === "assistant" && m.parts) {
                for (const p of m.parts as any[]) {
                  if ((p.type === "tool-call" || p.type?.startsWith("tool-")) && p.toolCallId === id) {
                    return p.input || p.args;
                  }
                }
              }
            }
            return null;
          })();
          
          console.log("🔧 [onToolCall] requestDangerousActionConfirmation args:", JSON.stringify(args, null, 2));
          
          // FIX: Нормализуем аргументы для updateXlsxCell
          // newContent -> sheet, targetId -> cell, xlsxValue -> value
          const normalizedArgs = args ? {
            ...args,
            // Для updateXlsxCell нормализуем поля
            sheet: args.action === "updateXlsxCell" ? (args.sheet || args.newContent) : args.sheet,
            cell: args.action === "updateXlsxCell" ? args.targetId : args.cell,
            value: args.action === "updateXlsxCell" ? args.xlsxValue : args.value,
          } : {};
          
          console.log("🔧 [onToolCall] requestDangerousActionConfirmation args (original):", JSON.stringify(args, null, 2));
          console.log("🔧 [onToolCall] requestDangerousActionConfirmation args (normalized):", JSON.stringify(normalizedArgs, null, 2));
          
          // FIX: Устанавливаем pendingConfirm
          setPendingConfirm({ toolCallId: id, payload: normalizedArgs });
          console.log("🔧 [onToolCall] ⚠️ requestDangerousActionConfirmation: pendingConfirm установлен, ожидаем клика пользователя:", { 
            toolCallId: id, 
            action: normalizedArgs?.action,
            sheet: normalizedArgs?.sheet,
            cell: normalizedArgs?.cell,
            value: normalizedArgs?.value,
            timestamp: new Date().toISOString(),
          });
          
          // FIX: НЕ отправляем pending result - согласно документации AI SDK для user interaction tools
          // Tool result будет отправлен только после клика пользователя в UI
          // sendAutomaticallyWhen автоматически отправит следующий запрос после получения всех tool results
          return;
        }

        // askForConfirmation - user-interaction tool, НЕ обрабатываем в onToolCall
        // Карточка рендерится из message.parts, результат отправляется через addToolOutput
        if (toolName === "askForConfirmation") {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:286',message:'askForConfirmation tool call detected',data:{toolCallId:id,toolName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.log("🔧 [onToolCall] ℹ️ askForConfirmation - user-interaction tool, пропускаем (рендерится из parts)");
          return;
        }

        if (toolName === "getLocation") {
          console.log("🔧 [onToolCall] ℹ️ getLocation - user-interaction tool, пропускаем (рендерится из parts)");
          return;
        }

        // Автоматически выполняем openTable
        if (toolName === "openTable") {
          console.log("🔧 [onToolCall] ✅ Выполняем openTable");
          const key = `openTable-${id}`;
          if (addToolOutputRef.current) {
            addToolOutputRef.current({
              toolCallId: id,
              output: { opened: true },
            } as any);
            sentToolResults.current.add(key);
          }
          return;
        }

        // Если это server-side tool (getRange/getSheets/performDangerousAction и т.д.) — НЕ делаем addToolOutput
        // потому что сервер сам вернёт tool-result
        console.log("🔧 [onToolCall] ℹ️ Server-side tool, сервер вернёт результат:", toolName);
        return;
      } catch (e: any) {
        // На случай падения — отдать error result чтобы не было "No tool output found"
        console.error("🔧 [onToolCall] ❌ Ошибка при обработке tool-call:", e);
        const existsNow = messagesRef.current.some((m) =>
          (m.parts ?? []).some((p: any) => 
            (p.type === "tool-call" || p.type?.startsWith("tool-")) && 
            (p.toolCallId === id || p.toolCallId === toolCall.toolCallId)
          )
        );
        if (existsNow) {
          console.log("🔧 [onToolCall] Отправляем error result для tool-call:", id);
          addToolOutput({
            toolCallId: id,
            output: { error: String(e?.message ?? e) },
          } as any);
        }
      }
    },
    // FIX: Автоматический сабмит после получения всех tool results
    // Это позволяет модели продолжить и написать ответ после того, как пользователь нажал "Да" в карточке
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  // Ref для актуальных messages, чтобы безопасно проверять tool-call существование
  const messagesRef = useRef<UIMessage[]>([]);
  useEffect(() => {
    const prevMessages = messagesRef.current;
    messagesRef.current = messages;
    
    // FIX: Логируем изменения messages для диагностики sendAutomaticallyWhen
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && lastMessage.parts) {
      const toolParts = lastMessage.parts.filter((p: any) => 
        p.type?.startsWith("tool-") || p.type === "tool-call" || p.type === "tool-result"
      );
      if (toolParts.length > 0) {
        // Проверяем, есть ли tool calls без results
        const toolCalls = toolParts.filter((p: any) => 
          (p.type === "tool-call" || (p.type?.startsWith("tool-") && !p.output && !p.result)) && 
          p.state !== "output-available"
        );
        const toolResults = toolParts.filter((p: any) => 
          p.output || p.result || p.state === "output-available"
        );
        
        console.log("🔍 [useEffect] Последнее assistant сообщение с tool parts:", {
          messageId: lastMessage.id,
          toolPartsCount: toolParts.length,
          toolCallsCount: toolCalls.length,
          toolResultsCount: toolResults.length,
          allComplete: toolCalls.length === 0 || toolResults.length >= toolCalls.length,
          toolParts: toolParts.map((p: any) => ({
            type: p.type,
            toolName: p.toolName,
            toolCallId: p.toolCallId,
            state: p.state,
            hasOutput: !!p.output,
            hasResult: !!p.result,
          })),
        });
        
        // FIX: Проверяем, должен ли сработать sendAutomaticallyWhen
        if (toolCalls.length > 0 && toolResults.length >= toolCalls.length) {
          console.log("✅ [useEffect] Все tool results готовы, sendAutomaticallyWhen должен сработать");
        } else if (toolCalls.length > 0 && toolResults.length < toolCalls.length) {
          console.warn("⚠️ [useEffect] Есть tool calls без results, sendAutomaticallyWhen НЕ сработает:", {
            toolCalls: toolCalls.map((p: any) => p.toolCallId),
            toolResults: toolResults.map((p: any) => p.toolCallId),
          });
        }
      }
    }
    
    // FIX: Проверяем, изменилось ли количество messages (новый запрос)
    if (messages.length !== prevMessages.length) {
      const lastMessage = messages[messages.length - 1];
      const hasToolResult = lastMessage?.role === "assistant" && lastMessage.parts?.some((p: any) => 
        (p.type === "tool-result" || (p.type?.startsWith("tool-") && p.output))
      );
      
      console.log("🔍 [useEffect] Количество messages изменилось:", {
        prev: prevMessages.length,
        current: messages.length,
        lastMessageRole: lastMessage?.role,
        hasToolResult,
      });
      
      // Если это новый user message после tool result - это авто-продолжение
      if (lastMessage?.role === "user" && messages.length > prevMessages.length) {
        const prevLast = prevMessages[prevMessages.length - 1];
        const hadToolResult = prevLast?.role === "assistant" && prevLast.parts?.some((p: any) => 
          (p.type === "tool-result" || (p.type?.startsWith("tool-") && p.output))
        );
        if (hadToolResult) {
          console.log("✅ [useEffect] АВТО-ПРОДОЛЖЕНИЕ: sendAutomaticallyWhen сработал! Новый user message после tool result");
        }
      }
    }
  }, [messages]);

  // Инициализация sendMessageRef и addToolOutputRef
  // FIX: Устанавливаем ref СРАЗУ после получения addToolOutput из useChat
  useEffect(() => {
    sendMessageRef.current = sendMessage;
    addToolOutputRef.current = addToolOutput;
    console.log("✅ [useEffect] addToolOutputRef установлен:", !!addToolOutputRef.current);
  }, [sendMessage, addToolOutput]);
  
  // FIX: Устанавливаем ref также синхронно после useChat (на случай если useEffect ещё не выполнился)
  // Это гарантирует, что ref будет доступен в onToolCall
  if (addToolOutput && !addToolOutputRef.current) {
    addToolOutputRef.current = addToolOutput;
    console.log("✅ [sync] addToolOutputRef установлен синхронно");
  }

  // FIX: Обёртка для addToolOutput с гарантированным логированием (после useChat)
  // ПРИМЕЧАНИЕ: Параметр 'tool' используется только для логирования, но НЕ передаётся в addToolOutput
  const addToolOutputWithLog = useCallback((params: { tool?: string; toolCallId: string; output: any }) => {
    const { toolCallId, tool, output } = params;
    const key = tool ? `${tool}-${toolCallId}` : toolCallId;
    
    console.log("📤 [addToolOutput] ВЫЗОВ:", {
      tool: tool || "unknown",
      toolCallId,
      output: JSON.stringify(output).substring(0, 200),
      timestamp: new Date().toISOString(),
      alreadySent: sentToolResults.current.has(key),
    });
    
    try {
      // ✅ Передаём только toolCallId и output (БЕЗ параметра 'tool')
      // Используем 'as any' для обхода проверки типов TypeScript
      addToolOutput({
        toolCallId,
        output,
      } as any);
      sentToolResults.current.add(key);
      console.log("✅ [addToolOutput] УСПЕШНО отправлен:", {
        tool: tool || "unknown",
        toolCallId,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error("❌ [addToolOutput] ОШИБКА при отправке:", {
        tool: tool || "unknown",
        toolCallId,
        error: e,
        timestamp: new Date().toISOString(),
      });
      throw e;
    }
  }, [addToolOutput]);

  // ШАГ B: Функция для обновления таблицы через API
  // Используем useRef для стабильной ссылки, чтобы не добавлять в зависимости useEffect
  const refreshRangeRef = useRef<((sheet: string, from: string, to: string) => Promise<void>) | null>(null);
  
  const refreshRange = useCallback(async (sheet: string, from: string, to: string) => {
    console.log("🔄 [refreshRange] Обновление таблицы:", { sheet, from, to, timestamp: new Date().toISOString() });
    try {
      // Используем GET /api/xlsx/range для обновления таблицы
      const params = new URLSearchParams({ sheet, from, to });
      const response = await fetch(`/api/xlsx/range?${params.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        console.error("❌ [refreshRange] Ошибка от API:", result.error);
        return;
      }
      
      console.log("✅ [refreshRange] Получены обновлённые данные:", {
        sheet: result.sheet,
        range: result.range,
        rows: result.data.length,
        cols: result.data[0]?.length || 0,
      });
      
      // Обрезаем пустые строки и столбцы
      const trimmed = trimSpreadsheetData(result.data, result.headers);
      
      // Обрезаем формулы так же, как данные
      let trimmedFormulas: Array<Array<string | null>> | undefined = undefined;
      if (result.formulas) {
        // Используем ту же логику обрезки, что и для данных
        const trimmedFormulasResult = trimSpreadsheetData(
          result.formulas.map((row: Array<string | null>) => row.map((cell: string | null) => cell ?? null)),
          result.headers
        );
        trimmedFormulas = trimmedFormulasResult.data as Array<Array<string | null>>;
      }
      
      console.log("✅ [refreshRange] Обрезанные данные:", {
        rows: trimmed.data.length,
        cols: trimmed.data[0]?.length || 0,
        hasFormulas: !!trimmedFormulas,
      });
      
      // Обновляем spreadsheetData
      setSpreadsheetData({
        sheet: result.sheet,
        range: result.range,
        data: trimmed.data,
        headers: trimmed.headers,
        formulas: trimmedFormulas, // Передаём обрезанные формулы
      });
      
      // Обновляем контекст
      const nextContext = {
        sheet: result.sheet,
        from: result.range?.split(":")[0] || from,
        to: result.range?.split(":")[1] || result.range?.split(":")[0] || to,
      };
      
      const prevContext = lastSpreadsheetContextRef.current;
      if (!prevContext || prevContext.sheet !== nextContext.sheet || prevContext.from !== nextContext.from || prevContext.to !== nextContext.to) {
        lastSpreadsheetContextRef.current = nextContext;
        setLastSpreadsheetContext(nextContext);
      }
      
      console.log("✅ [refreshRange] Таблица обновлена в UI:", {
        sheet: result.sheet,
        range: result.range,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("❌ [refreshRange] Ошибка при обновлении таблицы:", err);
    }
  }, []);

  // 2) Клиентский фолбэк: функция для открытия таблицы напрямую (без LLM)
  const openTableDirectly = useCallback(async (sheet: string = "Sheet1") => {
    if (process.env.NODE_ENV === "development") {
      console.log("🔧 [openTableDirectly] Открытие таблицы напрямую:", sheet);
    }
    try {
      // Сначала получаем used range
      const usedRangeResponse = await fetch("/api/xlsx/get-range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet, from: "A1", to: "ZZ1000" }), // Широкий диапазон для определения used range
      });
      
      if (!usedRangeResponse.ok) {
        throw new Error(`HTTP ${usedRangeResponse.status}`);
      }
      
      const usedRangeResult = await usedRangeResponse.json();
      if (usedRangeResult.error) {
        throw new Error(usedRangeResult.error);
      }
      
      // Используем данные из результата (они уже обрезаны через detectUsedRange на сервере)
      const trimmed = trimSpreadsheetData(usedRangeResult.data, usedRangeResult.headers);
      
      // Обрезаем формулы так же, как данные
      let trimmedFormulas: Array<Array<string | null>> | undefined = undefined;
      if (usedRangeResult.formulas) {
        const trimmedFormulasResult = trimSpreadsheetData(
          usedRangeResult.formulas.map((row: Array<string | null>) => row.map((cell: string | null) => cell ?? null)),
          usedRangeResult.headers
        );
        trimmedFormulas = trimmedFormulasResult.data as Array<Array<string | null>>;
      }
      
      // Парсим range для определения from/to
      const rangeMatch = (usedRangeResult.range || "").match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
      const from = rangeMatch ? rangeMatch[1] : "A1";
      const to = rangeMatch ? rangeMatch[2] : "D10";
      
      // Обновляем таблицу
      setSpreadsheetData({
        sheet: usedRangeResult.sheet,
        range: usedRangeResult.range || `${from}:${to}`,
        data: trimmed.data,
        headers: trimmed.headers,
        formulas: trimmedFormulas, // Передаём обрезанные формулы
      });
      
      // Обновляем контекст
      const nextContext = { sheet: usedRangeResult.sheet, from, to };
      lastSpreadsheetContextRef.current = nextContext;
      setLastSpreadsheetContext(nextContext);
      
      // Добавляем короткое assistant-сообщение в чат
      const assistantMessage: UIMessage = {
        id: `direct-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: `Открыл таблицу ${sheet}!${from}:${to}` }],
        createdAt: new Date(),
      } as UIMessage;
      setMessages((prev) => [...prev, assistantMessage]);
      
      if (process.env.NODE_ENV === "development") {
        console.log("✅ [openTableDirectly] Таблица открыта напрямую");
      }
      return true;
    } catch (err) {
      console.error("❌ [openTableDirectly] Ошибка:", err);
      return false;
    }
  }, [setMessages, setSpreadsheetData, setLastSpreadsheetContext]);
  
  // Сохраняем refreshRange в ref
  useEffect(() => {
    refreshRangeRef.current = refreshRange;
  }, [refreshRange]);

  // Логируем изменения messages для отладки (только при реальном изменении)
  const prevMessagesCountRef = useRef<number>(0);
  const prevLastMessageIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    const currentCount = messages.length;
    const lastMessage = messages[messages.length - 1];
    const lastMessageId = lastMessage?.id || null;
    
    // Логируем только если реально изменилось количество или последнее сообщение
    if (currentCount !== prevMessagesCountRef.current || lastMessageId !== prevLastMessageIdRef.current) {
      const lastMessageParts = lastMessage?.parts?.map((p: any) => ({
        type: p.type,
        toolName: p.toolName,
        toolCallId: p.toolCallId,
        state: p.state,
        hasOutput: !!p.output,
      })) || [];
      
      console.log("📨 [messages] Обновление messages:", {
        count: currentCount,
        lastMessageId,
        lastMessageRole: lastMessage?.role,
        lastMessageParts,
        timestamp: new Date().toISOString(),
      });
      
      // FIX: Проверяем, есть ли pending confirm без tool-result
      if (pendingConfirm && !lastMessageParts.some((p: any) => 
        p.toolCallId === pendingConfirm.toolCallId && p.hasOutput
      )) {
        console.warn("⚠️ [messages] Pending confirm существует, но tool-result не найден в последнем сообщении:", {
          pendingToolCallId: pendingConfirm.toolCallId,
          lastMessageParts,
        });
      }
      
      prevMessagesCountRef.current = currentCount;
      prevLastMessageIdRef.current = lastMessageId;
    }
  }, [messages, pendingConfirm]);

  // FIX: Инициализация только при смене threadId (1 раз), чтобы не затирать messages после получения ответа
  const didInitRef = useRef<string | null>(null);
  const initialMessagesRef = useRef<UIMessage[]>([]);
  
  useEffect(() => {
    // Инициализируем только если threadId изменился
    if (didInitRef.current === threadId) {
      return; // Уже инициализирован для этого threadId
    }
    
    didInitRef.current = threadId;
    initialMessagesRef.current = initialMessages; // Сохраняем ссылку на initialMessages
    
    console.log("🔄 [useEffect] Инициализация при смене threadId:", {
      threadId,
      messagesCount: initialMessages.length,
      firstMessage: initialMessages[0]?.id,
      lastMessage: initialMessages[initialMessages.length - 1]?.id,
    });
    
    // FIX: Инициализируем messages только один раз при смене threadId
    setMessages(initialMessages);
    
    // Очищаем appliedToolCalls при смене threadId
    appliedToolCalls.current.clear();
    handledConfirmations.current.clear();
    sentToolResults.current.clear(); // FIX: Очищаем отслеживание отправленных tool-results
    setPendingConfirm(null); // Очищаем pending confirmations
    setLocalError("");
    setText("");
    setMessagesTableData(null); // Скрываем таблицу при смене треда
    setSpreadsheetData(null); // Скрываем xlsx таблицу при смене треда
    setAvailableSheets([]); // Очищаем список листов
    setLastSpreadsheetContext(null); // Очищаем контекст при смене треда
  }, [threadId, setMessages]); // FIX: Только threadId и setMessages в зависимостях (setMessages стабилен из useChat)

  // Обработка результатов performDangerousAction (вынесено из рендера)
  // Используем useMemo для извлечения новых tool results, чтобы избежать лишних ререндеров
  const newToolResults = useMemo(() => {
    const results: Array<{
      toolCallId: string;
      output: any;
      input?: any;
      action: string;
      targetId: string;
      newContent?: string;
    }> = [];

    for (const msg of messages) {
      if (msg.role === "assistant" && msg.parts) {
        for (const part of msg.parts) {
          const partAny = part as any;
          const toolName = getToolName(partAny);
          if (toolName === "performDangerousAction") {
            const output = partAny?.output;
            const input = partAny?.input;
            const state = partAny?.state;
            const toolCallId = partAny?.toolCallId;

            if (state === "output-available" && output?.ok === true && toolCallId) {
              // Проверяем, не был ли уже применён этот tool call
              if (!appliedToolCalls.current.has(toolCallId)) {
                results.push({
                  toolCallId,
                  output,
                  input, // Добавляем input для получения xlsxValue
                  action: output.action,
                  targetId: output.targetId,
                  newContent: output.newContent,
                });
              }
            }
          }
        }
      }
    }
    return results;
  }, [messages]);

  // Применяем изменения только для новых результатов
  useEffect(() => {
    for (const result of newToolResults) {
      // Отмечаем как применённый СРАЗУ, чтобы избежать повторной обработки
      appliedToolCalls.current.add(result.toolCallId);

      // Применяем изменения в зависимости от действия
      if (result.action === "deleteMessage") {
        // Удаляем сообщение из списка
        setMessages((prev) => prev.filter((m) => m.id !== result.targetId));
        // Обновляем таблицу, если она открыта
        setMessagesTableData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: prev.rows.filter((row) => row.id !== result.targetId),
          };
        });
      } else if (result.action === "updateMessage") {
        // Обновляем текст сообщения
        setMessages((prev) =>
          prev.map((m) =>
            m.id === result.targetId
              ? { ...m, parts: [{ type: "text", text: result.newContent ?? "" }] }
              : m
          )
        );
        // Обновляем таблицу, если она открыта
        if (result.newContent) {
          setMessagesTableData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              rows: prev.rows.map((row) =>
                row.id === result.targetId
                  ? { ...row, content: result.newContent ?? row.content }
                  : row
              ),
            };
          });
        }
      } else if (result.action === "deleteThread") {
        // Редирект на страницу со списком тредов
        router.push("/threads");
        router.refresh();
        return; // Прерываем цикл, так как происходит редирект
      }
    }
  }, [newToolResults, router]);

  // Обработка openTable и getThreadMessagesTable (вынесено из рендера)
  const newTableToolResults = useMemo(() => {
    const openTableResults: Array<{ toolCallId: string; input: any }> = [];
    const getTableResults: Array<{ toolCallId: string; output: any }> = [];

    for (const msg of messages) {
      if (msg.role === "assistant" && msg.parts) {
        for (const part of msg.parts) {
          const partAny = part as any;
          const toolName = getToolName(partAny);
          const toolCallId = partAny?.toolCallId;

          if (toolName === "openTable") {
            const state = partAny?.state;
            const input = partAny?.input;
            if (state === "input-available" && input && toolCallId) {
              if (!appliedToolCalls.current.has(`openTable-${toolCallId}`)) {
                openTableResults.push({ toolCallId, input });
              }
            }
          }

          if (toolName === "getThreadMessagesTable") {
            const state = partAny?.state;
            const output = partAny?.output;
            if (state === "output-available" && output && toolCallId) {
              if (!appliedToolCalls.current.has(`getTable-${toolCallId}`)) {
                getTableResults.push({ toolCallId, output });
              }
            }
          }
        }
      }
    }
    return { openTableResults, getTableResults };
  }, [messages]);

  // Обработка xlsx tools (getSheets/getRange/updateCell) - ШАГ 1
  const newXlsxToolResults = useMemo(() => {
    const getSheetsResults: Array<{ toolCallId: string; output: any }> = [];
    const getRangeResults: Array<{ toolCallId: string; output: any }> = [];
    const updateCellResults: Array<{ toolCallId: string; output: any; input?: any }> = [];

    for (const msg of messages) {
      if (msg.role === "assistant" && msg.parts) {
        for (const part of msg.parts) {
          const partAny = part as any;
          const toolName = getToolName(partAny);
          const toolCallId = partAny?.toolCallId;

          if (toolName === "getSheets") {
            const state = partAny?.state;
            const output = partAny?.output;
            if (state === "output-available" && output && toolCallId) {
              if (!appliedToolCalls.current.has(`getSheets-${toolCallId}`)) {
                getSheetsResults.push({ toolCallId, output });
              }
            }
          }

          if (toolName === "getRange") {
            const state = partAny?.state;
            const output = partAny?.output;
            console.log("🔍 [getRange] Найден getRange part:", { toolName, state, hasOutput: !!output, toolCallId, partType: partAny?.type });
            if (state === "output-available" && output && toolCallId) {
              if (!appliedToolCalls.current.has(`getRange-${toolCallId}`)) {
                console.log("✅ [getRange] Добавляем в getRangeResults:", { toolCallId, sheet: output?.sheet, dataLength: output?.data?.length });
                getRangeResults.push({ toolCallId, output });
              } else {
                console.log("⚠️ [getRange] Уже обработан:", toolCallId);
              }
            } else {
              console.log("⚠️ [getRange] Не готов к обработке:", { state, hasOutput: !!output, toolCallId });
            }
          }

          if (toolName === "updateCell") {
            const state = partAny?.state;
            const output = partAny?.output;
            const input = partAny?.input;
            if (state === "output-available" && output && toolCallId) {
              if (!appliedToolCalls.current.has(`updateCell-${toolCallId}`)) {
                updateCellResults.push({ toolCallId, output, input });
              }
            }
          }
        }
      }
    }
    return { getSheetsResults, getRangeResults, updateCellResults };
  }, [messages]);

  // Применяем изменения для openTable и getThreadMessagesTable
  useEffect(() => {
    // Обработка openTable
    for (const { toolCallId, input } of newTableToolResults.openTableResults) {
      appliedToolCalls.current.add(`openTable-${toolCallId}`);
      setMessagesTableData({
        title: input.title || "Сообщения треда",
        threadId: input.threadId || threadId,
        columns: [],
        rows: [],
      });
    }

    // Обработка getThreadMessagesTable
    for (const { toolCallId, output } of newTableToolResults.getTableResults) {
      appliedToolCalls.current.add(`getTable-${toolCallId}`);
      setMessagesTableData((prev) => {
        if (prev && prev.threadId === threadId) {
          return {
            ...prev,
            columns: output.columns || [],
            rows: output.rows || [],
          };
        }
        return {
          title: "Сообщения треда",
          threadId: threadId,
          columns: output.columns || [],
          rows: output.rows || [],
        };
      });
    }
  }, [newTableToolResults, threadId]);

  // Применяем изменения для xlsx tools - ШАГ 1: FIX Maximum update depth
  useEffect(() => {
    // Обработка getSheets - только сохраняем список листов, НЕ вызываем автоматически getRange
    // Модель должна сама вызывать getRange после getSheets согласно system prompt
    for (const { toolCallId, output } of newXlsxToolResults.getSheetsResults) {
      // Дедупликация: проверяем, не обработан ли уже
      if (appliedToolCalls.current.has(`getSheets-${toolCallId}`)) {
        continue;
      }
      appliedToolCalls.current.add(`getSheets-${toolCallId}`);
      
      if (output?.sheets && Array.isArray(output.sheets)) {
        setAvailableSheets(output.sheets);
        console.log("📊 [xlsx] Доступные листы сохранены:", output.sheets);
        // НЕ вызываем автоматически getRange - модель должна сделать это сама
      }
    }

    // Обработка getRange - FIX: НЕ устанавливаем spreadsheetData автоматически
    // TableMessage будет показываться в сообщении ассистента (рендерится в renderMessages)
    // SpreadsheetView будет показываться только при явном запросе "открыть таблицу" через openTable
    console.log("🔍 [useEffect] Обработка getRangeResults:", { count: newXlsxToolResults.getRangeResults.length });
    for (const { toolCallId, output } of newXlsxToolResults.getRangeResults) {
      console.log("🔍 [useEffect] Обрабатываем getRange:", { toolCallId, hasSheet: !!output?.sheet, hasData: !!output?.data, dataIsArray: Array.isArray(output?.data) });
      
      // Дедупликация: проверяем, не обработан ли уже
      if (appliedToolCalls.current.has(`getRange-${toolCallId}`)) {
        console.log("⚠️ [useEffect] getRange уже обработан:", toolCallId);
        continue;
      }
      appliedToolCalls.current.add(`getRange-${toolCallId}`);
      
      if (output?.sheet && output?.data && Array.isArray(output.data)) {
        console.log("✅ [useEffect] getRange output валиден:", { sheet: output.sheet, dataLength: output.data.length, range: output.range });
        // Парсим range (например "A1:H30") в from и to
        const rangeMatch = (output.range || "").match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        const from = rangeMatch ? rangeMatch[1] : "A1";
        const to = rangeMatch ? rangeMatch[2] : "H30";
        
        // FIX: Вычисляем nextContext и обновляем ref для будущих вызовов
        const nextContext = {
          sheet: output.sheet,
          from,
          to,
        };
        
        // Обновляем ref для контекста (нужно для system prompt)
        const prevContext = lastSpreadsheetContextRef.current;
        if (!prevContext || prevContext.sheet !== nextContext.sheet || prevContext.from !== nextContext.from || prevContext.to !== nextContext.to) {
          lastSpreadsheetContextRef.current = nextContext;
          console.log("📊 [xlsx] Сохранён контекст (ref) для будущих вызовов:", nextContext);
          
          // Обновляем state только если реально изменилось
          setLastSpreadsheetContext(nextContext);
        }
        
        // FIX: НЕ устанавливаем spreadsheetData для обычных вызовов getRange
        // TableMessage будет показан в сообщении ассистента (рендерится в renderMessages)
        // SpreadsheetView будет показан только при явном запросе "открыть таблицу" через openTable
        console.log("📊 [xlsx] getRange обработан, TableMessage будет показан в сообщении ассистента");
      } else {
        console.error("❌ [useEffect] getRange output невалиден:", {
          hasSheet: !!output?.sheet,
          hasData: !!output?.data,
          dataIsArray: Array.isArray(output?.data),
          output: JSON.stringify(output).substring(0, 200),
        });
      }
    }

    // FIX: Обработка updateCell - теперь возвращает needs_confirmation
    for (const { toolCallId, output, input } of newXlsxToolResults.updateCellResults) {
      // Дедупликация: проверяем, не обработан ли уже
      if (appliedToolCalls.current.has(`updateCell-${toolCallId}`)) {
        continue;
      }
      appliedToolCalls.current.add(`updateCell-${toolCallId}`);
      
      // FIX: updateCell теперь возвращает { status: "needs_confirmation", ... }
      if (output?.status === "needs_confirmation") {
        console.log("🔵 [xlsx] updateCell требует подтверждения:", {
          toolCallId,
          confirmationId: output.confirmationId,
          sheet: output.sheet,
          cell: output.cell,
          value: output.value,
          question: output.question,
        });
        
        // Устанавливаем pendingConfirm для показа UI
        setPendingConfirm({
          toolCallId: output.confirmationId || toolCallId,
          payload: {
            action: output.action || "updateXlsxCell",
            sheet: output.sheet,
            cell: output.cell,
            value: output.value,
            question: output.question,
            confirmationId: output.confirmationId,
          },
        });
        
        console.log("✅ [xlsx] pendingConfirm установлен для updateCell confirmation");
      } else if (output?.status === "error") {
        console.error("❌ [xlsx] updateCell ошибка:", output.error);
        setLocalError(output.error || "Ошибка при обработке запроса на изменение ячейки");
      }
    }
    
    // Обработка performDangerousAction с action="updateXlsxCell" - FIX: Автоматическое обновление через API
    for (const { toolCallId, output, input } of newToolResults) {
      if (output?.ok === true && output?.action === "updateXlsxCell") {
        // FIX: Логирование
        console.log("🔧 [performDangerousAction] Результат получен:", {
          toolCallId,
          action: output.action,
          targetId: output.targetId,
          newContent: output.newContent,
          ok: output.ok,
          input: input ? { targetId: input.targetId, newContent: input.newContent, xlsxValue: input.xlsxValue } : null,
        });
        
        // Дедупликация
        if (appliedToolCalls.current.has(`performDangerousAction-updateXlsxCell-${toolCallId}`)) {
          console.log("⚠️ [performDangerousAction] Уже обработан, пропускаем:", toolCallId);
          continue;
        }
        appliedToolCalls.current.add(`performDangerousAction-updateXlsxCell-${toolCallId}`);
        
        // 3) Автоматически обновляем таблицу через refreshRange после updateXlsxCell
        if (process.env.NODE_ENV === "development") {
          console.log("🔄 [performDangerousAction] Начинаем обновление таблицы после updateXlsxCell");
        }
        const context = lastSpreadsheetContextRef.current;
        if (process.env.NODE_ENV === "development") {
          console.log("🔄 [performDangerousAction] Контекст таблицы:", context);
        }
        
        if (context) {
          if (process.env.NODE_ENV === "development") {
            console.log("🔄 [xlsx] Автоматическое обновление таблицы после updateXlsxCell:", context);
          }
          if (refreshRangeRef.current) {
            refreshRangeRef.current(context.sheet, context.from, context.to).then(() => {
              if (process.env.NODE_ENV === "development") {
                console.log("✅ [xlsx] refreshRange завершён успешно");
              }
            }).catch((err) => {
              console.error("❌ [xlsx] Ошибка в refreshRange:", err);
            });
          } else {
            console.error("❌ [xlsx] refreshRangeRef.current равен null!");
          }
        } else {
          // Fallback: используем дефолтный диапазон
          const sheet = input?.newContent || "Sheet1";
          if (process.env.NODE_ENV === "development") {
            console.log("⚠️ [xlsx] Нет контекста, используем дефолтный диапазон:", { sheet, from: "A1", to: "D10" });
          }
          if (refreshRangeRef.current) {
            refreshRangeRef.current(sheet, "A1", "D10").then(() => {
              if (process.env.NODE_ENV === "development") {
                console.log("✅ [xlsx] refreshRange (fallback) завершён успешно");
              }
            }).catch((err) => {
              console.error("❌ [xlsx] Ошибка в refreshRange (fallback):", err);
            });
          } else {
            console.error("❌ [xlsx] refreshRangeRef.current равен null (fallback)!");
          }
        }
      }
    }
  }, [newXlsxToolResults, newToolResults, threadId]); // Зависимости: newXlsxToolResults (стабильный useMemo) + newToolResults + threadId (refreshRange через ref)

  const errText =
    localError ||
    (error ? (error as any)?.message ?? String(error) : "");

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Область сообщений */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 12,
              opacity: 0.5,
            }}
          >
            <div style={{ fontSize: 32 }}>💬</div>
            <div style={{ fontSize: 16 }}>Начните диалог</div>
          </div>
        ) : (
          messages.map((m: UIMessage) => {
            // FIX: Диагностика для ВСЕХ сообщений при рендеринге
            if (m.role === "assistant") {
              // Диагностический лог A: когда приходит assistant message
              const toolParts = m.parts?.filter((p: any) => 
                p.type?.startsWith("tool-") || p.type === "tool-call" || p.type === "tool-result"
              ) || [];
              console.log("🔵 [LOG A] Assistant message:", {
                messageId: m.id,
                partsCount: m.parts?.length || 0,
                toolParts: toolParts.map((p: any) => ({
                  type: p.type,
                  toolCallId: p.toolCallId,
                  state: p.state,
                  hasInput: !!p.input,
                  hasOutput: !!p.output,
                })),
              });
              
              // #region agent log
              const askForConfirmationParts = (m.parts || []).filter((p: any) => 
                p?.type === "tool-askForConfirmation" || 
                (p?.type?.startsWith("tool-") && (getToolName(p) === "askForConfirmation"))
              );
              if (askForConfirmationParts.length > 0) {
                fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:1168',message:'askForConfirmation parts found in assistant message',data:{messageId:m.id,partsCount:askForConfirmationParts.length,parts:askForConfirmationParts.map((p:any)=>({type:p?.type,toolCallId:p?.toolCallId,state:p?.state,hasInput:!!p?.input,hasOutput:!!p?.output,hasResult:!!(p?.result||p?.output),inputMessage:p?.input?.message,outputValue:p?.output,resultValue:p?.result})),isLastMessage:m.id === messages[messages.length - 1]?.id,messageIndex:messages.findIndex((msg:any)=>msg.id===m.id),totalMessages:messages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              }
              // #endregion
              
              console.log("🔍 [render] Рендерим assistant сообщение:", {
                messageId: m.id,
                hasParts: !!m.parts,
                partsLength: m.parts?.length || 0,
                parts: m.parts?.map((p: any) => ({
                  type: p?.type,
                  toolCallId: p?.toolCallId,
                  state: p?.state,
                })) || [],
                isLastMessage: m.id === messages[messages.length - 1]?.id,
              });
            }
            
            // Проверяем, есть ли что показать в сообщении
            // Показываем сообщение если есть content ИЛИ parts
            const mAny = m as any;
            const hasRenderableContent =
              (typeof mAny.content === "string" && mAny.content.trim().length > 0) ||
              (Array.isArray(mAny.content) && mAny.content.length > 0) ||
              (Array.isArray(m.parts) && m.parts.length > 0);

            if (!hasRenderableContent) return null;
            
            return (
            <div
              key={m.id}
              style={{
                display: "flex",
                gap: 16,
                maxWidth: "768px",
                margin: "0 auto",
                width: "100%",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background:
                    m.role === "user"
                      ? "rgba(100,150,255,0.2)"
                      : "rgba(150,100,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 14,
                }}
              >
                {m.role === "user" ? "👤" : "🤖"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onContextMenu={(e) => {
                    // Показываем меню только для сообщений пользователя
                    if (m.role === "user") {
                      e.preventDefault();
                      const messageText = getText(m);
                      setContextMenu({
                        messageId: m.id,
                        messageText,
                        position: { x: e.clientX, y: e.clientY },
                      });
                    }
                  }}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    background:
                      m.role === "user"
                        ? "rgba(100,150,255,0.1)"
                        : "rgba(255,255,255,0.05)",
                    border:
                      m.role === "user"
                        ? "1px solid rgba(100,150,255,0.2)"
                        : "1px solid rgba(255,255,255,0.1)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    lineHeight: 1.6,
                    cursor: m.role === "user" ? "context-menu" : "default",
                  }}
                >
                  {/* Рендерим text parts (скрываем "[tool-only reply]") */}
                  {(() => {
                    const text = getText(m);
                    // Скрываем текст если это "[tool-only reply]"
                    if (text && text.includes("[tool-only reply]")) {
                      return null;
                    }
                    return text;
                  })()}
                  
                  {/* Рендерим tool parts для assistant сообщений */}
                  {m.role === "assistant" && (() => {
                    // FIX: Диагностика ДО фильтрации - показываем ВСЕ parts для ВСЕХ assistant сообщений
                    if (m.parts && m.parts.length > 0) {
                      console.log("🔍 [render] ДО фильтрации - ВСЕ parts в assistant сообщении:", {
                        messageId: m.id,
                        isLastMessage: m.id === messages[messages.length - 1]?.id,
                        totalParts: m.parts.length,
                        allParts: m.parts.map((p: any, idx: number) => ({
                          idx,
                          type: p?.type,
                          toolName: getToolName(p),
                          toolCallId: p?.toolCallId,
                          state: p?.state,
                          hasInput: !!p?.input,
                          hasOutput: !!p?.output,
                          isToolPart: isToolPart(p),
                          input: p?.input,
                          output: p?.output,
                        })),
                        toolPartsAfterFilter: m.parts.filter(isToolPart).map((p: any) => ({
                          type: p?.type,
                          toolName: getToolName(p),
                          toolCallId: p?.toolCallId,
                        })),
                      });
                    } else {
                      console.log("🔍 [render] Assistant сообщение БЕЗ parts:", {
                        messageId: m.id,
                        hasParts: !!m.parts,
                        partsLength: m.parts?.length || 0,
                      });
                    }
                    
                    const toolParts = m.parts?.filter(isToolPart) || [];
                    
                    // #region agent log
                    const askForConfirmationInToolParts = toolParts.filter((p: any) => 
                      getToolName(p) === "askForConfirmation" || p?.type === "tool-askForConfirmation"
                    );
                    if (askForConfirmationInToolParts.length > 0) {
                      fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:1308',message:'askForConfirmation in toolParts',data:{messageId:m.id,totalToolParts:toolParts.length,askForConfirmationCount:askForConfirmationInToolParts.length,parts:askForConfirmationInToolParts.map((p:any)=>({type:p?.type,toolCallId:p?.toolCallId,state:p?.state,hasInput:!!p?.input,hasOutput:!!p?.output,hasResult:!!p?.result}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    }
                    // #endregion
                    
                    // FIX: Логируем ВСЕ tool parts для диагностики
                    if (toolParts.length > 0) {
                      console.log("🔍 [render] Tool parts найдены после фильтрации:", {
                        messageId: m.id,
                        toolPartsCount: toolParts.length,
                        toolParts: toolParts.map((p: any) => ({
                          toolName: getToolName(p),
                          partType: p?.type,
                          toolCallId: p?.toolCallId,
                          state: p?.state,
                          hasInput: !!p?.input,
                          hasOutput: !!p?.output,
                        })),
                      });
                    }
                    
                    // FIX: Отслеживаем, какие toolCallId уже показали карточку в этом рендере, чтобы избежать дублей
                    // Создаем Set один раз для всего массива toolParts
                    const shownToolCallIdsInThisRender = new Set<string>();
                    
                    return toolParts.map((part: any, idx: number) => {
                        const toolName = getToolName(part);
                        const toolCallId = part?.toolCallId;
                        

                        // 3) TOOL DEBUG показываем ТОЛЬКО в development и если включён флаг
                        const showToolDebug = typeof window !== "undefined" && 
                                             (process.env.NEXT_PUBLIC_TOOL_DEBUG === "1" || 
                                              (process.env.NODE_ENV === "development" && localStorage.getItem("showToolDebug") === "1"));
                        const isUITool = toolName === "askForConfirmation" ||
                                        toolName === "requestDangerousActionConfirmation" || 
                                        toolName === "openTable" ||
                                        toolName === "getThreadMessagesTable" ||
                                        toolName === "getLocation";
                        
                        // Показываем tool debug только если включён флаг и это не UI tool
                        if (showToolDebug && !isUITool && (part?.toolCallId || part?.toolName || part?.state)) {
                          return (
                            <details key={`tool-debug-${toolCallId || idx}`} style={{ marginTop: 8, padding: 8, background: "rgba(255,200,0,0.1)", border: "1px solid rgba(255,200,0,0.3)", borderRadius: 4 }}>
                              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🔧 TOOL DEBUG: {toolName || "unknown"}</summary>
                              <pre style={{ fontSize: 10, overflow: "auto", maxHeight: "200px", marginTop: 8 }}>{JSON.stringify(part, null, 2)}</pre>
                            </details>
                          );
                        }
                        
                        // Если tool debug выключен и это не UI tool - не рендерим ничего
                        if (!showToolDebug && !isUITool) {
                          return null;
                        }

                        // getLocation - user-interaction tool, рендерим из message.parts
                        if (toolName === "getLocation" || part?.type === "tool-getLocation") {
                          const state = part?.state;
                          const hasResult = state === "output-available" && !!(part?.result || part?.output);
                          const isLastMessage = m.id === messages[messages.length - 1]?.id;
                          
                          // Защита от дублей
                          if (!toolCallId || shownToolCallIdsInThisRender.has(toolCallId)) {
                            return null;
                          }
                          
                          // Если уже есть результат - показываем текст вместо карточки
                          if (hasResult) {
                            const resultValue = part?.result || part?.output;
                            let locationInfo = "";
                            if (resultValue?.allowed) {
                              if (resultValue.city) {
                                locationInfo = `Местоположение: ${resultValue.city} (${resultValue.latitude?.toFixed(6)}, ${resultValue.longitude?.toFixed(6)})`;
                              } else {
                                locationInfo = `Местоположение: ${resultValue.latitude?.toFixed(6)}, ${resultValue.longitude?.toFixed(6)}`;
                              }
                            } else {
                              locationInfo = "Доступ к местоположению отклонён";
                            }
                            shownToolCallIdsInThisRender.add(toolCallId);
                            return (
                              <div
                                key={`location-result-${toolCallId}-${idx}`}
                                style={{
                                  marginTop: 12,
                                  padding: "12px",
                                  borderRadius: 8,
                                  background: "rgba(150,150,150,0.1)",
                                  fontSize: 14,
                                  color: "rgba(150,150,150,0.8)",
                                  fontStyle: "italic",
                                }}
                              >
                                {locationInfo}
                              </div>
                            );
                          }
                          
                          // Показываем карточку только для последнего сообщения без результата
                          const condition1 = (state === "input-available" || state === undefined);
                          const condition2 = !hasResult;
                          const condition3 = (part?.type === "tool-getLocation" || part?.type === "tool-invocation");
                          const condition4 = isLastMessage;
                          const allConditionsMet = condition1 && condition2 && condition3 && condition4;
                          
                          if (allConditionsMet) {
                            const reason = part?.input?.reason;
                            
                            shownToolCallIdsInThisRender.add(toolCallId);
                            
                            console.log("🔵 [getLocation] Показываем карточку разрешения на геолокацию", {
                              toolCallId,
                              state,
                              reason,
                              hasResult: false,
                            });
                            
                            return (
                              <LocationPermissionCard
                                key={`location-permission-${toolCallId}-${idx}`}
                                reason={reason}
                                toolCallId={toolCallId}
                                onConfirm={async (result) => {
                                  console.log("🟢 [getLocation] Пользователь ответил:", {
                                    toolCallId,
                                    result,
                                    timestamp: new Date().toISOString(),
                                  });
                                  
                                  // Защита от дублей
                                  if (handledConfirmations.current.has(toolCallId)) {
                                    console.warn("⚠️ [getLocation] Уже обработано, пропускаем:", toolCallId);
                                    return;
                                  }
                                  
                                  handledConfirmations.current.add(toolCallId);
                                  
                                  try {
                                    const currentMessage = messages.find((m: any) => 
                                      m.role === "assistant" && 
                                      m.parts?.some((p: any) => p.toolCallId === toolCallId)
                                    );
                                    
                                    if (!currentMessage) {
                                      console.error("❌ [getLocation] Tool call не найден в messages:", toolCallId);
                                      handledConfirmations.current.delete(toolCallId);
                                      return;
                                    }
                                    
                                    // Отправляем результат через addToolOutput
                                    addToolOutput({
                                      toolCallId,
                                      output: result, // { allowed: boolean, latitude?, longitude?, accuracy?, reason? }
                                    } as any);
                                    
                                    console.log("✅ [getLocation] addToolOutput вызван успешно:", {
                                      toolCallId,
                                      output: result,
                                    });
                                  } catch (e) {
                                    console.error("❌ [getLocation] Ошибка при вызове addToolOutput:", e);
                                    handledConfirmations.current.delete(toolCallId);
                                  }
                                }}
                              />
                            );
                          }
                          
                          return null;
                        }

                        // askForConfirmation - user-interaction tool, рендерим из message.parts
                        if (toolName === "askForConfirmation" || part?.type === "tool-askForConfirmation") {
                          const state = part?.state;
                          // FIX: hasResult должен быть true только если state === "output-available" И есть реальный результат
                          // Если state === "input-available", результата еще нет, даже если есть output
                          const hasResult = state === "output-available" && !!(part?.result || part?.output);
                          const isLastMessage = m.id === messages[messages.length - 1]?.id;
                          
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:1373',message:'askForConfirmation part check',data:{toolCallId,state,hasResult,partType:part?.type,hasInput:!!part?.input,hasOutput:!!part?.output,hasResultField:!!(part?.result||part?.output),shownAlready:shownToolCallIdsInThisRender.has(toolCallId),isLastMessage,stateValue:state,outputValue:part?.output,resultValue:part?.result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                          // #endregion
                          
                          // FIX: Защита от дублей - проверяем, не показывали ли уже карточку для этого toolCallId
                          if (!toolCallId || shownToolCallIdsInThisRender.has(toolCallId)) {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:1382',message:'askForConfirmation blocked by duplicate check',data:{toolCallId,hasToolCallId:!!toolCallId,shownAlready:shownToolCallIdsInThisRender.has(toolCallId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                            // #endregion
                            return null;
                          }
                          
                          // FIX: Если уже есть результат - показываем текст вместо карточки
                          if (hasResult) {
                            const resultValue = part?.result || part?.output;
                            const userAnswer = resultValue === "yes" || resultValue === true ? "Да" : "Нет";
                            shownToolCallIdsInThisRender.add(toolCallId);
                            return (
                              <div
                                key={`confirmation-result-${toolCallId}-${idx}`}
                                style={{
                                  marginTop: 12,
                                  padding: "12px",
                                  borderRadius: 8,
                                  background: "rgba(150,150,150,0.1)",
                                  fontSize: 14,
                                  color: "rgba(150,150,150,0.8)",
                                  fontStyle: "italic",
                                }}
                              >
                                Пользователь ответил: {userAnswer}
                              </div>
                            );
                          }
                          
                          // Показываем карточку ТОЛЬКО когда:
                          // 1. Это tool-invocation askForConfirmation
                          // 2. Состояние "input-available" (ожидает ввода)
                          // 3. Нет результата (result/output)
                          // 4. Ещё не показывали карточку для этого toolCallId
                          // 5. Это ПОСЛЕДНЕЕ сообщение (FIX: карточка должна быть видна только в последнем сообщении)
                          const condition1 = (state === "input-available" || state === undefined);
                          const condition2 = !hasResult;
                          const condition3 = (part?.type === "tool-askForConfirmation" || part?.type === "tool-invocation");
                          const condition4 = isLastMessage; // FIX: только в последнем сообщении
                          const allConditionsMet = condition1 && condition2 && condition3 && condition4;
                          
                          // #region agent log
                          fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:1418',message:'askForConfirmation render condition check',data:{toolCallId,state,hasResult,partType:part?.type,condition1,condition2,condition3,condition4,allConditionsMet,isLastMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                          // #endregion
                          
                          if (allConditionsMet) {
                            const message = part?.input?.message || "Подтвердите действие";
                            
                            // Помечаем, что показываем карточку для этого toolCallId
                            shownToolCallIdsInThisRender.add(toolCallId);
                            
                            // ЛОГ A: Когда показываем карточку
                            console.log("🔵 [LOG A] SHOW askForConfirmation", {
                              toolCallId,
                              state,
                              inputMessage: message,
                              hasResult: false,
                            });
                            
                            // #region agent log
                            const isLastMsg = m.id === messages[messages.length - 1]?.id;
                            fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ChatClient.tsx:1426',message:'ConfirmationCard rendering with context',data:{toolCallId,message,state,messageId:m.id,isLastMessage:isLastMsg,messageIndex:messages.findIndex((msg:any)=>msg.id===m.id),totalMessages:messages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
                            // #endregion
                            
                            return (
                              <ConfirmationCard
                                key={`confirmation-${toolCallId}-${idx}`}
                                message={message}
                                toolCallId={toolCallId}
                                onConfirm={async (decision) => {
                                  // ЛОГ B: На клик
                                  console.log("🟢 [LOG B] CLICK askForConfirmation", {
                                    toolCallId,
                                    result: decision,
                                    timestamp: new Date().toISOString(),
                                  });
                                  
                                  // Защита от дублей
                                  if (handledConfirmations.current.has(toolCallId)) {
                                    console.warn("⚠️ [askForConfirmation] Уже обработано, пропускаем:", toolCallId);
                                    return;
                                  }
                                  
                                  handledConfirmations.current.add(toolCallId);
                                  
                                  try {
                                    // FIX: Проверяем, что toolCallId существует в messages перед вызовом addToolOutput
                                    const currentMessage = messages.find((m: any) => 
                                      m.role === "assistant" && 
                                      m.parts?.some((p: any) => p.toolCallId === toolCallId)
                                    );
                                    
                                    if (!currentMessage) {
                                      console.error("❌ [askForConfirmation] Tool call не найден в messages:", toolCallId);
                                      handledConfirmations.current.delete(toolCallId);
                                      return;
                                    }
                                    
                                    // 🔧 TOOL OUTPUT DETAILS - детальное логирование перед addToolOutput
                                    const lastMessage = messages[messages.length - 1];
                                    const toolCallsInLastMessage = lastMessage?.role === "assistant" 
                                      ? (lastMessage.parts || []).filter((p: any) => 
                                          (p.type === "tool-call" || p.type?.startsWith("tool-")) && 
                                          p.toolCallId === toolCallId
                                        )
                                      : [];
                                    
                                    console.log("🔧 TOOL OUTPUT DETAILS:", {
                                      toolCallId,
                                      output: decision,
                                      outputType: typeof decision,
                                      outputSchema: "z.string() - ожидает строку 'yes' или 'no'",
                                      lastMessage: {
                                        id: lastMessage?.id,
                                        role: lastMessage?.role,
                                        partsCount: lastMessage?.parts?.length || 0,
                                      },
                                      toolCalls: toolCallsInLastMessage.map((p: any) => ({
                                        type: p.type,
                                        toolCallId: p.toolCallId,
                                        toolName: p.toolName || getToolName(p),
                                        hasOutput: !!(p.output || p.result),
                                        output: p.output || p.result,
                                        state: p.state,
                                      })),
                                      allMessagesCount: messages.length,
                                      timestamp: new Date().toISOString(),
                                    });
                                    
                                    // FIX: Используем правильный формат addToolOutput (БЕЗ параметра 'tool')
                                    // Согласно AI SDK документации: { toolCallId: string; output: any }
                                    // outputSchema для askForConfirmation: z.string() - ожидает строку "yes" или "no"
                                    // Используем 'as any' для обхода проверки типов TypeScript, т.к. документация говорит, что 'tool' не нужен
                                    try {
                                      addToolOutput({
                                        toolCallId,                 // ✅ ВАЖНО: именно toolCallId из part.toolCallId
                                        output: decision,           // "yes" или "no" - строка
                                      } as any);
                                      
                                      console.log("✅ [askForConfirmation] addToolOutput вызван успешно:", {
                                        toolCallId,
                                        output: decision,
                                        outputType: typeof decision,
                                      });
                                    } catch (addToolOutputError: any) {
                                      console.error("❌ [askForConfirmation] Ошибка при вызове addToolOutput:", {
                                        error: addToolOutputError,
                                        errorMessage: addToolOutputError?.message,
                                        errorStack: addToolOutputError?.stack,
                                        toolCallId,
                                        output: decision,
                                        outputType: typeof decision,
                                        lastMessage: lastMessage,
                                        toolCalls: toolCallsInLastMessage,
                                      });
                                      handledConfirmations.current.delete(toolCallId);
                                      return;
                                    }
                                    
                                    // FIX: НЕ вызываем sendMessage() явно
                                    // sendAutomaticallyWhen должен автоматически отправить запрос после обновления messages
                                    // Явный вызов sendMessage() может отправить старые messages без output
                                    
                                    // ЛОГ C: Через setTimeout проверяем, что output появился в messages
                                    setTimeout(() => {
                                      // Используем актуальные messages из замыкания
                                      // ВАЖНО: messages в замыкании могут быть устаревшими, но для лога достаточно
                                      const updatedMessages = messages;
                                      const lastMessage = updatedMessages[updatedMessages.length - 1];
                                      const toolPart = lastMessage?.parts?.find((p: any) => 
                                        p.toolCallId === toolCallId && (p.type === "tool-askForConfirmation" || p.type?.startsWith("tool-"))
                                      ) as any;
                                      console.log("🔵 [LOG C] После addToolOutput (setTimeout 300ms):", {
                                        toolCallId,
                                        lastMessageId: lastMessage?.id,
                                        hasToolPart: !!toolPart,
                                        toolPartHasOutput: !!(toolPart?.output),
                                        toolPartHasResult: !!(toolPart?.result),
                                        toolPartOutput: toolPart?.output,
                                        toolPartResult: toolPart?.result,
                                        toolPartState: toolPart?.state,
                                        note: "sendAutomaticallyWhen должен автоматически отправить запрос после обновления messages с output",
                                      });
                                    }, 300);
                                  } catch (e) {
                                    console.error("❌ [askForConfirmation] Ошибка при вызове addToolOutput:", e);
                                    handledConfirmations.current.delete(toolCallId);
                                  }
                                }}
                              />
                            );
                          }
                          return null;
                        }

                        // C) requestDangerousActionConfirmation - ВСЕГДА показываем карточку если это этот tool
                        if (toolName === "requestDangerousActionConfirmation" || part?.type === "tool-requestDangerousActionConfirmation") {
                          // FIX: Используем part.input или pendingConfirm.payload для получения question
                          // Используем нормализованные поля (sheet, cell, value) из pendingConfirm.payload
                          const question = part?.input?.question || 
                                         pendingConfirm?.payload?.question || 
                                         (pendingConfirm?.payload?.action === "updateXlsxCell" 
                                           ? `Изменить ячейку ${pendingConfirm.payload.sheet || pendingConfirm.payload.newContent || "Sheet1"}!${pendingConfirm.payload.cell || pendingConfirm.payload.targetId || ""} на значение: ${pendingConfirm.payload.value || pendingConfirm.payload.xlsxValue || ""}?`
                                           : "Подтвердите действие");
                          const state = part?.state;

                          console.log("🔧 [requestDangerousActionConfirmation] Проверка условий для показа карточки:", {
                            toolCallId,
                            state,
                            hasOutput: !!part?.output,
                            isHandled: handledConfirmations.current.has(toolCallId),
                            hasPendingConfirm: pendingConfirm?.toolCallId === toolCallId,
                            question,
                            partType: part?.type,
                          });

                          // C) Показываем карточку если:
                          // 1. state === "input-available" И нет output И не обработано
                          // 2. ИЛИ есть pendingConfirm с этим toolCallId (даже если part.input undefined)
                          // 3. ИЛИ это tool-requestDangerousActionConfirmation part без output
                          // 4. ИЛИ это tool-call без output (модель вызвала, но результат ещё не пришёл)
                          // ВАЖНО: НЕ показываем, если уже есть output (результат уже отправлен через addToolOutput)
                          const hasOutput = part?.output !== undefined && part?.output !== null;
                          const shouldShow = !hasOutput && (
                            (state === "input-available" && toolCallId && !handledConfirmations.current.has(toolCallId)) ||
                            (pendingConfirm?.toolCallId === toolCallId) ||
                            (part?.type === "tool-requestDangerousActionConfirmation" && toolCallId) ||
                            (part?.type === "tool-call" && part?.toolName === "requestDangerousActionConfirmation" && toolCallId)
                          );

                          if (shouldShow) {
                            console.log("✅ [requestDangerousActionConfirmation] Показываем карточку подтверждения");
                            return (
                              <DangerousActionConfirmationCard
                                key={`dangerous-confirmation-${toolCallId}-${idx}`}
                                question={question}
                                toolCallId={toolCallId}
                                onConfirm={async (decision) => {
                                  console.log("🔧 [requestDangerousActionConfirmation] Пользователь нажал:", decision, "toolCallId:", toolCallId);
                                  
                                  // FIX: Защита от дублей через handledConfirmations
                                  if (handledConfirmations.current.has(toolCallId)) {
                                    console.warn("⚠️ [requestDangerousActionConfirmation] Уже обработано, пропускаем:", toolCallId);
                                    return;
                                  }
                                  
                                  // Помечаем как обработанное СРАЗУ (до addToolOutput)
                                  handledConfirmations.current.add(toolCallId);
                                  setPendingConfirm(null); // Очищаем pending confirm
                                  
                                  // FIX: outputSchema ожидает { confirmed: boolean }, а не { decision: "yes"/"no" }
                                  const confirmed = decision === "yes";
                                  const key = `requestDangerousActionConfirmation-${toolCallId}`;
                                  
                                  console.log("🔧 [requestDangerousActionConfirmation] Вызываем addToolOutput с финальным решением:", {
                                    toolCallId,
                                    decision,
                                    confirmed,
                                    timestamp: new Date().toISOString(),
                                    addToolOutputRefExists: !!addToolOutputRef.current,
                                    addToolOutputExists: !!addToolOutput,
                                  });
                                  
                                  // FIX: Используем addToolOutput напрямую (он доступен из useChat)
                                  // addToolOutputRef может быть null, но addToolOutput всегда доступен
                                  try {
                                    if (addToolOutput) {
                                      console.log("📤 [onConfirm] Вызываем addToolOutput напрямую с:", {
                                        toolCallId,
                                        confirmed,
                                        output: { confirmed, pending: false },
                                      });
                                      addToolOutput({
                                        toolCallId,
                                        output: { confirmed, pending: false },
                                      } as any);
                                      sentToolResults.current.add(key);
                                      console.log("✅ [onConfirm] addToolOutput успешно отправлен:", {
                                        toolCallId,
                                        decision,
                                        confirmed,
                                        timestamp: new Date().toISOString(),
                                      });
                                    } else if (addToolOutputRef.current) {
                                      console.log("📤 [onConfirm] Используем addToolOutputRef.current как fallback");
                                      addToolOutputRef.current({
                                        toolCallId,
                                        output: { confirmed, pending: false },
                                      } as any);
                                      sentToolResults.current.add(key);
                                      console.log("✅ [onConfirm] addToolOutputRef.current успешно вызван");
                                    } else {
                                      console.error("❌ [onConfirm] И addToolOutput, и addToolOutputRef.current равны null!");
                                      handledConfirmations.current.delete(toolCallId);
                                    }
                                  } catch (e) {
                                    console.error("❌ [onConfirm] Ошибка при отправке addToolOutput:", e);
                                    handledConfirmations.current.delete(toolCallId);
                                  }
                                }}
                              />
                            );
                          } else {
                            console.log("❌ [requestDangerousActionConfirmation] Карточка НЕ показывается:", {
                              stateOk: state === "input-available",
                              noOutput: !part?.output,
                              hasToolCallId: !!toolCallId,
                              notHandled: !handledConfirmations.current.has(toolCallId),
                              hasPendingConfirm: pendingConfirm?.toolCallId === toolCallId,
                            });
                          }
                        }

                        // performDangerousAction
                        if (toolName === "performDangerousAction") {
                          return (
                            <DangerousActionResultCard
                              key={`dangerous-result-${toolCallId}-${idx}`}
                              part={part}
                              onThreadDeleted={() => {
                                // Fallback для старой логики (если нужно)
                                router.push("/threads");
                                router.refresh();
                              }}
                            />
                          );
                        }

                        // openTable - открытие таблицы сообщений
                        // Обработка вынесена в useEffect, здесь только рендеринг (если нужно)
                        if (toolName === "openTable") {
                          // UI рендеринг не требуется, обработка в useEffect
                          return null;
                        }

                        // getThreadMessagesTable - получение данных таблицы
                        // Обработка вынесена в useEffect, здесь только рендеринг (если нужно)
                        if (toolName === "getThreadMessagesTable") {
                          // UI рендеринг не требуется, обработка в useEffect
                          return null;
                        }

                        // getRange - показываем TableMessage в чате
                        if (toolName === "getRange") {
                          const state = part?.state;
                          const output = part?.output;
                          
                          if (state === "output-available" && output && output.sheet && output.data && Array.isArray(output.data)) {
                            const trimmed = trimSpreadsheetData(output.data, output.headers);
                            return (
                              <TableMessage
                                key={`table-${toolCallId}-${idx}`}
                                tableData={{
                                  sheet: output.sheet,
                                  range: output.range || "A1:H30",
                                  data: trimmed.data,
                                  headers: trimmed.headers,
                                  formulas: output.formulas, // Передаём формулы
                                }}
                                onRangeSelect={(mention) => {
                                  // Вставляем меншон в позицию курсора в input
                                  const input = inputRef.current;
                                  if (input) {
                                    const start = input.selectionStart || 0;
                                    const end = input.selectionEnd || 0;
                                    const currentText = text;
                                    const newText = currentText.substring(0, start) + mention + currentText.substring(end);
                                    setText(newText);
                                    
                                    // Устанавливаем курсор после вставленного меншона
                                    setTimeout(() => {
                                      const newCursorPos = start + mention.length;
                                      input.setSelectionRange(newCursorPos, newCursorPos);
                                      input.focus();
                                    }, 0);
                                  } else {
                                    // Fallback: добавляем в конец
                                    setText((prev) => {
                                      const trimmed = prev.trim();
                                      return trimmed ? `${trimmed} ${mention}` : mention;
                                    });
                                  }
                                }}
                              />
                            );
                          }
                          return null;
                        }

                        // logInvites - показываем карточку с результатом отправки приглашений
                        if (toolName === "logInvites") {
                          return (
                            <InvitationSentCard
                              key={`invites-${toolCallId}-${idx}`}
                              part={part}
                            />
                          );
                        }

                        // explainFormula - показываем карточку с объяснением формулы
                        if (toolName === "explainFormula") {
                          const state = part?.state;
                          const output = part?.output || part?.result;
                          
                          if (state === "output-available" && output) {
                            return (
                              <FormulaExplanationCard
                                key={`formula-${toolCallId}-${idx}`}
                                part={part}
                              />
                            );
                          }
                          return null;
                        }

                        return null;
                      });
                  })()}
                </div>
              </div>
            </div>
            );
          })
        )}
        
        {/* Таблица сообщений */}
        {messagesTableData && messagesTableData.rows.length > 0 && (
          <div
            style={{
              maxWidth: "768px",
              margin: "0 auto",
              width: "100%",
            }}
          >
            <MessagesTable
              title={messagesTableData.title}
              threadId={messagesTableData.threadId}
              columns={messagesTableData.columns}
              rows={messagesTableData.rows}
              onEdit={(messageId, newContent) => {
                // Инициируем подтверждение через отправку сообщения модели
                const confirmMessage = `Измени сообщение ${messageId} на: ${newContent}`;
                sendMessage({ text: confirmMessage });
              }}
              onDelete={(messageId) => {
                // Инициируем подтверждение через отправку сообщения модели
                const deleteMessage = `Удалить сообщение ${messageId}`;
                sendMessage({ text: deleteMessage });
              }}
            />
          </div>
        )}

        {/* XLSX Spreadsheet - ШАГ 2 */}
        {spreadsheetData && (
          <div
            style={{
              maxWidth: "768px",
              margin: "0 auto",
              width: "100%",
            }}
          >
            {spreadsheetData && (
              <SpreadsheetView
                key={`${spreadsheetData.sheet}-${spreadsheetData.range}-${spreadsheetData.data.length}-${spreadsheetData.data[0]?.length || 0}`}
                sheet={spreadsheetData.sheet}
                range={spreadsheetData.range}
                data={spreadsheetData.data}
                headers={spreadsheetData.headers}
                formulas={spreadsheetData.formulas}
                onRangeSelect={(mention) => {
                  // ШАГ 4: Вставка меншона в поле ввода
                  setText((prev) => {
                    const trimmed = prev.trim();
                    return trimmed ? `${trimmed} ${mention}` : mention;
                  });
                }}
                onEditCell={async (sheet, cell, value) => {
                  if (process.env.NODE_ENV === "development") {
                    console.log("📝 [onEditCell] Редактирование ячейки (UI):", { sheet, cell, value });
                  }
                  
                  // Локальное подтверждение для UI-редактирования (БЕЗ LLM)
                  const confirmed = window.confirm(
                    `Изменить ячейку ${sheet}!${cell} на значение: ${value}?`
                  );
                  
                  if (!confirmed) {
                    return;
                  }

                  // НЕ делаем оптимистичное обновление для формул - они требуют пересчёта на сервере
                  // Для обычных значений можно было бы сделать оптимистичное обновление,
                  // но чтобы не усложнять, просто ждём ответа от сервера и обновляем через refreshRange

                  // Вызываем API для обновления ячейки
                  try {
                    const response = await fetch("/api/xlsx/update-cell", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sheet,
                        cell,
                        value,
                      }),
                    });

                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const result = await response.json();

                    if (!result.ok) {
                      throw new Error(result.error || "Ошибка обновления ячейки");
                    }

                    // Обновляем таблицу через getRange
                    const context = lastSpreadsheetContextRef.current;
                    if (context) {
                      await refreshRangeRef.current?.(context.sheet, context.from, context.to);
                    } else {
                      // Fallback: используем текущий диапазон из spreadsheetData
                      const currentData = spreadsheetData;
                      if (currentData) {
                        const rangeMatch = currentData.range.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
                        if (rangeMatch) {
                          await refreshRangeRef.current?.(currentData.sheet, rangeMatch[1], rangeMatch[2]);
                        }
                      }
                    }

                    if (process.env.NODE_ENV === "development") {
                      console.log("✅ [onEditCell] Ячейка обновлена через API, таблица обновлена");
                    }
                  } catch (error) {
                    console.error("❌ [onEditCell] Ошибка при обновлении ячейки:", error);
                    setLocalError(error instanceof Error ? error.message : String(error));
                    // Откатываем оптимистичное обновление - перезагружаем таблицу
                    if (lastSpreadsheetContextRef.current) {
                      const ctx = lastSpreadsheetContextRef.current;
                      refreshRangeRef.current?.(ctx.sheet, ctx.from, ctx.to);
                    }
                  }
                }}
              />
            )}
          </div>
        )}
        
        {isLoading && (
          <div
            style={{
              display: "flex",
              gap: 16,
              maxWidth: "768px",
              margin: "0 auto",
              width: "100%",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(150,100,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              🤖
            </div>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ opacity: 0.6 }}>Печатает...</div>
            </div>
          </div>
        )}
      </div>

      {/* Область ввода */}
      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          flexShrink: 0,
          background: "#0a0a0a",
        }}
      >
        {errText && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              background: "rgba(255,100,100,0.1)",
              border: "1px solid rgba(255,100,100,0.3)",
              borderRadius: 8,
              fontSize: 12,
              color: "#ff6b6b",
            }}
          >
            {errText}
          </div>
        )}
        
        {/* FIX: UI подтверждения опасных действий над инпутом */}
        {pendingConfirm && (
          <div
            style={{
              marginBottom: 12,
              padding: "12px 16px",
              background: "rgba(255,200,100,0.1)",
              border: "1px solid rgba(255,200,100,0.3)",
              borderRadius: 8,
              fontSize: 14,
              maxWidth: "768px",
              margin: "0 auto 12px auto",
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              {pendingConfirm.payload?.question || 
               (pendingConfirm.payload?.action === "updateXlsxCell"
                 ? `Изменить ячейку ${pendingConfirm.payload.sheet || "Sheet1"}!${pendingConfirm.payload.cell || ""} на значение: ${pendingConfirm.payload.value || ""}?`
                 : "Подтвердите действие")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  const toolCallId = pendingConfirm.toolCallId;
                  const payload = pendingConfirm.payload;
                  
                  console.log("🔧 [pendingConfirm UI] ✅ Пользователь нажал 'Да', toolCallId:", toolCallId);
                  
                  if (handledConfirmations.current.has(toolCallId)) {
                    console.warn("⚠️ [pendingConfirm UI] Уже обработано, пропускаем:", toolCallId);
                    return;
                  }
                  
                  handledConfirmations.current.add(toolCallId);
                  setPendingConfirm(null);
                  
                  console.log("🔵 [pendingConfirm UI] Пользователь подтвердил действие, выполняем напрямую через API");
                  
                  // FIX: НЕ отправляем addToolOutput с confirmed:true, потому что:
                  // 1. Pending result уже был отправлен в onToolCall
                  // 2. OpenAI API уже получил ответ и завершил запрос
                  // 3. Вместо этого выполняем действие напрямую через API
                  
                  // FIX: Выполняем updateXlsxCell напрямую через API /api/xlsx/update-cell
                  if (payload.action === "updateXlsxCell" || payload.confirmationId) {
                    const sheet = payload.sheet || "Sheet1";
                    const cell = payload.cell;
                    const value = payload.value;
                    
                    if (sheet && cell && value !== undefined) {
                      console.log("🔵 [pendingConfirm UI] Выполняем updateXlsxCell через API:", { sheet, cell, value });
                      
                      try {
                        const response = await fetch("/api/xlsx/update-cell", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            sheet,
                            cell,
                            value,
                          }),
                        });
                        
                        if (!response.ok) {
                          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                        
                        const result = await response.json();
                        
                        if (!result.ok) {
                          throw new Error(result.error || "Ошибка обновления ячейки");
                        }
                        
                        console.log("✅ [pendingConfirm UI] updateXlsxCell выполнен успешно:", result);
                        
                        // FIX: Обновляем таблицу через refreshRange
                        const context = lastSpreadsheetContextRef.current;
                        if (context && refreshRangeRef.current) {
                          console.log("🔄 [pendingConfirm UI] Обновляем таблицу через refreshRange:", context);
                          await refreshRangeRef.current(context.sheet, context.from, context.to);
                          console.log("✅ [pendingConfirm UI] Таблица обновлена");
                        } else {
                          console.warn("⚠️ [pendingConfirm UI] Нет контекста таблицы для refreshRange");
                        }
                      } catch (error) {
                        console.error("❌ [pendingConfirm UI] Ошибка при выполнении updateXlsxCell:", error);
                        setLocalError(error instanceof Error ? error.message : String(error));
                      }
                    } else {
                      console.error("❌ [pendingConfirm UI] Недостаточно данных для updateXlsxCell:", { sheet, cell, value });
                    }
                  }
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid rgba(100,255,100,0.3)",
                  background: "rgba(100,255,100,0.1)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Да
              </button>
              <button
                type="button"
                onClick={async () => {
                  const toolCallId = pendingConfirm.toolCallId;
                  console.log("🔧 [pendingConfirm UI] ❌ Пользователь нажал 'Нет', toolCallId:", toolCallId);
                  
                  if (handledConfirmations.current.has(toolCallId)) {
                    console.warn("⚠️ [pendingConfirm UI] Уже обработано, пропускаем:", toolCallId);
                    return;
                  }
                  
                  handledConfirmations.current.add(toolCallId);
                  setPendingConfirm(null);
                  
                  console.log("🔵 [pendingConfirm UI] Пользователь отменил действие");
                  
                  // FIX: НЕ отправляем addToolOutput с confirmed:false, потому что:
                  // 1. Pending result уже был отправлен в onToolCall с confirmed:false, pending:true
                  // 2. OpenAI API уже получил ответ и завершил запрос
                  // 3. Действие не выполняется, просто закрываем UI
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,100,100,0.3)",
                  background: "rgba(255,100,100,0.1)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Нет
              </button>
            </div>
          </div>
        )}
        
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            setLocalError("");

            const value = text.trim();
            // FIX: Блокируем отправку сообщений пока висит pendingConfirm
            if (!value || isLoading || pendingConfirm) {
              if (pendingConfirm) {
                console.log("⚠️ [form] Блокируем отправку: pendingConfirm активен");
              }
              return;
            }

            try {
              // 2) Клиентский фолбэк: перехватываем команды ДО отправки в LLM
              const lowerValue = value.toLowerCase();
              
              // Команда "открой таблицу" / "покажи таблицу"
              if (/открой таблицу|покажи таблицу|открыть таблицу|показать таблицу/i.test(value)) {
                if (process.env.NODE_ENV === "development") {
                  console.log("🔧 [client-fallback] Перехвачена команда 'открой таблицу', открываем напрямую");
                }
                const opened = await openTableDirectly("Sheet1");
                if (opened) {
                  setText("");
                  return; // НЕ отправляем в LLM
                }
              }
              
              // Команда с mention диапазона @Sheet1!A1:D10 или Sheet1!A1:D10
              const mentionMatch = value.match(/(?:@)?(\w+)!([A-Z]+\d+)(?::([A-Z]+\d+))?/i);
              if (mentionMatch && /покажи|открой|показ|открыть/i.test(value)) {
                const [, sheet, from, to] = mentionMatch;
                const actualTo = to || from;
                if (process.env.NODE_ENV === "development") {
                  console.log("🔧 [client-fallback] Перехвачен mention диапазона, открываем напрямую:", { sheet, from, to: actualTo });
                }
                await refreshRange(sheet, from, actualTo);
                setText("");
                return; // НЕ отправляем в LLM
              }

              if (process.env.NODE_ENV === "development") {
                console.log("📤 [sendMessage] Отправка сообщения пользователя:", value);
              }
              await sendMessage({ text: value });
              setText("");
            } catch (e: unknown) {
              console.error("❌ [sendMessage] Ошибка:", e);
              setLocalError(e instanceof Error ? e.message : String(e));
            }
          }}
          style={{
            display: "flex",
            gap: 12,
            maxWidth: "768px",
            margin: "0 auto",
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Введите сообщение…"
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              fontSize: 14,
            }}
            disabled={isLoading || !!pendingConfirm}
          />
          <button
            type="submit"
            disabled={isLoading || !text.trim() || !!pendingConfirm}
            style={{
              padding: "12px 24px",
              borderRadius: 12,
              border: "1px solid rgba(100,150,255,0.3)",
              background: isLoading
                ? "rgba(100,150,255,0.2)"
                : "rgba(100,150,255,0.3)",
              color: "inherit",
              cursor: isLoading || !text.trim() || pendingConfirm ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 500,
              opacity: isLoading || !text.trim() || pendingConfirm ? 0.5 : 1,
            }}
          >
            {isLoading ? "..." : "Отправить"}
          </button>
        </form>
      </div>

      {/* Контекстное меню для сообщений пользователя */}
      {contextMenu && (
        <MessageContextMenu
          messageId={contextMenu.messageId}
          messageText={contextMenu.messageText}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            // Открываем модальное окно для редактирования
            setEditModal({
              messageId: contextMenu.messageId,
              messageText: contextMenu.messageText,
            });
          }}
          onDelete={async () => {
            const messageId = contextMenu.messageId;
            console.log("🗑️ [onDelete] Удаление сообщения:", messageId);
            
            // Останавливаем стрим, если он активен
            if (status === "streaming" || status === "submitted") {
              console.log("🗑️ [onDelete] Останавливаем стрим перед удалением");
              stop?.();
            }
            
            // Очищаем pendingConfirm, если удаляется сообщение с этим toolCallId
            if (pendingConfirm) {
              const messageToDelete = messagesRef.current.find((m) => m.id === messageId);
              const hasToolCall = messageToDelete?.parts?.some((p: any) => 
                (p.type === "tool-call" || p.type?.startsWith("tool-")) && 
                p.toolCallId === pendingConfirm.toolCallId
              );
              if (hasToolCall) {
                console.log("🗑️ [onDelete] Очищаем pendingConfirm для удаляемого сообщения:", pendingConfirm.toolCallId);
                setPendingConfirm(null);
              }
            }
            
            // Отправляем команду на удаление с реальным ID сообщения
            const deleteCommand = `Удалить сообщение ${messageId}`;
            try {
              await sendMessage({ text: deleteCommand });
            } catch (e) {
              setLocalError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      )}

      {/* Модальное окно для редактирования сообщения */}
      {editModal && (
        <EditMessageModal
          currentText={editModal.messageText}
          onSave={async (newText) => {
            setEditModal(null);
            // Отправляем команду на редактирование с реальным ID сообщения
            const editCommand = `Измени сообщение ${editModal.messageId} на: ${newText}`;
            try {
              await sendMessage({ text: editCommand });
            } catch (e) {
              setLocalError(e instanceof Error ? e.message : String(e));
            }
          }}
          onCancel={() => setEditModal(null)}
        />
      )}
    </div>
  );
}