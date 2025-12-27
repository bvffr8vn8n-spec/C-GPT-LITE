"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import TableMessage from "./TableMessage";
import EditMessageModal from "./EditMessageModal";
import MessagesTable from "./MessagesTable";
import SpreadsheetView from "./SpreadsheetView";

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
};

function getText(m: UIMessage) {
  const parts = (m.parts ?? []) as Array<any>;
  return parts.map((p) => (p?.type === "text" ? String(p.text ?? "") : "")).join("");
}

// Проверяем, является ли part tool part
function isToolPart(part: any): boolean {
  return part?.type?.startsWith("tool-") || part?.type === "dynamic-tool";
}

// Получаем tool name из part
function getToolName(part: any): string | null {
  if (part?.type?.startsWith("tool-")) {
    return part.type.replace("tool-", "");
  }
  if (part?.type === "dynamic-tool") {
    return part.toolName || null;
  }
  return null;
}

// Утилита для обрезки пустых строк и столбцов справа и снизу
function trimSpreadsheetData(
  data: Array<Array<string | number | null>>,
  headers?: string[]
): {
  data: Array<Array<string | number | null>>;
  headers?: string[];
} {
  if (!data || data.length === 0) {
    return { data: [], headers: headers ? [] : undefined };
  }

  // Проверяем, является ли ячейка непустой
  const isNonEmpty = (cell: string | number | null | undefined): boolean => {
    if (cell === null || cell === undefined) return false;
    if (typeof cell === "string") {
      return cell.trim().length > 0;
    }
    return true; // number всегда непустой
  };

  // Находим последнюю непустую строку
  let lastNonEmptyRow = -1;
  for (let rowIdx = data.length - 1; rowIdx >= 0; rowIdx--) {
    const row = data[rowIdx];
    if (row && row.some((cell) => isNonEmpty(cell))) {
      lastNonEmptyRow = rowIdx;
      break;
    }
  }

  // Если все строки пустые
  if (lastNonEmptyRow === -1) {
    return { data: [], headers: headers ? [] : undefined };
  }

  // Находим последний непустой столбец
  let lastNonEmptyCol = -1;
  for (let colIdx = (data[0]?.length || 0) - 1; colIdx >= 0; colIdx--) {
    let hasNonEmpty = false;
    for (let rowIdx = 0; rowIdx <= lastNonEmptyRow; rowIdx++) {
      if (isNonEmpty(data[rowIdx]?.[colIdx])) {
        hasNonEmpty = true;
        break;
      }
    }
    if (hasNonEmpty) {
      lastNonEmptyCol = colIdx;
      break;
    }
  }

  // Если все столбцы пустые
  if (lastNonEmptyCol === -1) {
    return { data: [], headers: headers ? [] : undefined };
  }

  // Обрезаем данные
  const trimmedData = data
    .slice(0, lastNonEmptyRow + 1)
    .map((row) => row.slice(0, lastNonEmptyCol + 1));

  // Обрезаем headers если есть
  const trimmedHeaders = headers
    ? headers.slice(0, lastNonEmptyCol + 1)
    : undefined;

  return {
    data: trimmedData,
    headers: trimmedHeaders,
  };
}

// Компонент для askForConfirmation
function ConfirmationCard({ 
  message, 
  toolCallId, 
  onConfirm 
}: { 
  message: string; 
  toolCallId: string; 
  onConfirm: (confirmed: boolean) => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "16px",
        borderRadius: 12,
        border: "1px solid rgba(255,200,100,0.3)",
        background: "rgba(255,200,100,0.1)",
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>
        {message}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onConfirm(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(100,200,100,0.5)",
            background: "rgba(100,200,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Подтвердить
        </button>
        <button
          onClick={() => onConfirm(false)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(200,100,100,0.5)",
            background: "rgba(200,100,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

// Компонент для getLocation
function LocationCard({ part }: { part: any }) {
  const state = part?.state;
  const output = part?.output;

  if (state === "input-available" || state === "input-streaming") {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid rgba(100,150,255,0.2)",
          background: "rgba(100,150,255,0.08)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          📍 <b>Получение локации...</b>
        </div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Загрузка...</div>
      </div>
    );
  }

  if (state === "output-available" && output?.city) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid rgba(100,150,255,0.2)",
          background: "rgba(100,150,255,0.08)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          📍 <b>Ваша локация</b>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          {output.city}
        </div>
      </div>
    );
  }

  return null;
}

// Компонент для requestDangerousActionConfirmation
function DangerousActionConfirmationCard({
  question,
  toolCallId,
  onConfirm,
}: {
  question: string;
  toolCallId: string;
  onConfirm: (decision: "yes" | "no") => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "16px",
        borderRadius: 12,
        border: "1px solid rgba(255,150,100,0.4)",
        background: "rgba(255,150,100,0.15)",
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5, fontWeight: 500 }}>
        ⚠️ {question}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onConfirm("yes")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(100,200,100,0.5)",
            background: "rgba(100,200,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Да
        </button>
        <button
          onClick={() => onConfirm("no")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(200,100,100,0.5)",
            background: "rgba(200,100,100,0.2)",
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
  );
}

// Компонент для performDangerousAction (результат)
function DangerousActionResultCard({ part, onThreadDeleted }: { part: any; onThreadDeleted?: () => void }) {
  const state = part?.state;
  const output = part?.output;
  const input = part?.input;

  // Проверяем успешное удаление треда и вызываем callback
  useEffect(() => {
    if (state === "output-available" && output && input?.action === "deleteThread" && output.ok === true) {
      // Небольшая задержка для показа результата перед редиректом
      const timer = setTimeout(() => {
        if (onThreadDeleted) {
          onThreadDeleted();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state, output, input?.action, onThreadDeleted]);

  if (state === "input-available" || state === "input-streaming") {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid rgba(150,150,255,0.2)",
          background: "rgba(150,150,255,0.08)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          ⚙️ <b>Выполнение операции...</b>
        </div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          {input?.action === "deleteThread" && "Удаление треда..."}
          {input?.action === "deleteMessage" && "Удаление сообщения..."}
          {input?.action === "updateMessage" && "Обновление сообщения..."}
        </div>
      </div>
    );
  }

  if (state === "output-available" && output) {
    const isSuccess = output.ok === true;
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          border: isSuccess
            ? "1px solid rgba(100,200,100,0.3)"
            : "1px solid rgba(255,100,100,0.3)",
          background: isSuccess
            ? "rgba(100,200,100,0.1)"
            : "rgba(255,100,100,0.1)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          {isSuccess ? "✅" : "❌"} <b>{isSuccess ? "Операция выполнена" : "Ошибка"}</b>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          {output.message}
        </div>
      </div>
    );
  }

  return null;
}

// Компонент контекстного меню для сообщений пользователя
function MessageContextMenu({
  messageId,
  messageText,
  position,
  onClose,
  onEdit,
  onDelete,
}: {
  messageId: string;
  messageText: string;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 1000,
        background: "rgba(20, 20, 20, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        borderRadius: 8,
        padding: "4px",
        minWidth: 120,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <button
        onClick={() => {
          onEdit();
          onClose();
        }}
        style={{
          width: "100%",
          padding: "8px 12px",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontSize: 14,
          borderRadius: 4,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        ✏️ Изменить
      </button>
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        style={{
          width: "100%",
          padding: "8px 12px",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontSize: 14,
          borderRadius: 4,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 100, 100, 0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        🗑️ Удалить
      </button>
    </div>
  );
}

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
  } | null>(null);
  
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);

  // ШАГ 2: Сохраняем последний контекст открытой таблицы
  const [lastSpreadsheetContext, setLastSpreadsheetContext] = useState<{
    sheet: string;
    from: string;
    to: string;
  } | null>(null);

  // Случайные города для getLocation
  const cities = ["Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань", "Нижний Новгород"];

  const { messages, setMessages, sendMessage, status, error, addToolResult } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
    threadId,
        // ШАГ 2: Передаём последний контекст таблицы на сервер
        spreadsheetContext: lastSpreadsheetContext,
      },
    }),
    onError: (e: unknown) => {
      console.error("❌ [useChat] Error:", e);
      let errorMessage = e instanceof Error ? e.message : String(e);
      
      // Проверка на отсутствие API ключа
      if (errorMessage.includes("API key") || errorMessage.includes("OPENAI_API_KEY") || errorMessage.includes("не настроен")) {
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
      console.log("🔧 [onToolCall] Tool call получен:", {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        dynamic: toolCall.dynamic,
      });

      // Игнорируем dynamic tools
      if (toolCall.dynamic) {
        console.log("🔧 [onToolCall] ❌ Dynamic tool, игнорируем");
        return;
      }

      // Автоматически выполняем getLocation
      if (toolCall.toolName === "getLocation") {
        const randomCity = cities[Math.floor(Math.random() * cities.length)];
        console.log("🔧 [onToolCall] ✅ Выполняем getLocation, город:", randomCity);
        addToolResult({
          tool: "getLocation" as any,
          toolCallId: toolCall.toolCallId,
          output: { city: randomCity },
        });
      }

      // Автоматически выполняем openTable
      if (toolCall.toolName === "openTable") {
        console.log("🔧 [onToolCall] ✅ Выполняем openTable");
        addToolResult({
          tool: "openTable" as any,
          toolCallId: toolCall.toolCallId,
          output: { opened: true },
        });
      }
    },
  });



  // Логируем изменения messages для отладки
  useEffect(() => {
    console.log("📨 [messages] Обновление messages:", {
      count: messages.length,
      lastMessage: messages[messages.length - 1] ? {
        role: messages[messages.length - 1].role,
        id: messages[messages.length - 1].id,
        partsCount: messages[messages.length - 1].parts?.length || 0,
        parts: messages[messages.length - 1].parts?.map((p: any) => ({
          type: p?.type,
          toolName: getToolName(p),
          state: p?.state,
        })),
      } : null,
    });
  }, [messages]);

  // Подхватываем историю при смене threadId или initialMessages
  useEffect(() => {
    console.log("🔄 [useEffect] Инициализация с initialMessages:", {
        threadId,
      messagesCount: initialMessages.length,
      firstMessage: initialMessages[0]?.id,
      lastMessage: initialMessages[initialMessages.length - 1]?.id,
    });
    // Очищаем appliedToolCalls при смене threadId
    appliedToolCalls.current.clear();
    handledConfirmations.current.clear(); // ШАГ 4: очищаем подтверждения
    setMessages(initialMessages);
    setLocalError("");
    setText("");
    setMessagesTableData(null); // Скрываем таблицу при смене треда
    setSpreadsheetData(null); // Скрываем xlsx таблицу при смене треда
    setAvailableSheets([]); // Очищаем список листов
    setLastSpreadsheetContext(null); // Очищаем контекст при смене треда
  }, [threadId, initialMessages, setMessages]);

  // Обработка результатов performDangerousAction (вынесено из рендера)
  // Используем useMemo для извлечения новых tool results, чтобы избежать лишних ререндеров
  const newToolResults = useMemo(() => {
    const results: Array<{
      toolCallId: string;
      output: any;
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
            const state = partAny?.state;
            const toolCallId = partAny?.toolCallId;

            if (state === "output-available" && output?.ok === true && toolCallId) {
              // Проверяем, не был ли уже применён этот tool call
              if (!appliedToolCalls.current.has(toolCallId)) {
                results.push({
                  toolCallId,
                  output,
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
    const updateCellResults: Array<{ toolCallId: string; output: any }> = [];

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
            if (state === "output-available" && output && toolCallId) {
              if (!appliedToolCalls.current.has(`getRange-${toolCallId}`)) {
                getRangeResults.push({ toolCallId, output });
              }
            }
          }

          if (toolName === "updateCell") {
            const state = partAny?.state;
            const output = partAny?.output;
            if (state === "output-available" && output && toolCallId) {
              if (!appliedToolCalls.current.has(`updateCell-${toolCallId}`)) {
                updateCellResults.push({ toolCallId, output });
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
    // Обработка getSheets - ШАГ 2: Автоматически вызываем getRange после getSheets
    for (const { toolCallId, output } of newXlsxToolResults.getSheetsResults) {
      // Дедупликация: проверяем, не обработан ли уже
      if (appliedToolCalls.current.has(`getSheets-${toolCallId}`)) {
        continue;
      }
      appliedToolCalls.current.add(`getSheets-${toolCallId}`);
      
      if (output?.sheets && Array.isArray(output.sheets)) {
        setAvailableSheets(output.sheets);
        // Автоматически выбираем первый лист и вызываем getRange
        if (output.sheets.length > 0) {
          const firstSheet = output.sheets[0];
          console.log("📊 [xlsx] Доступные листы:", output.sheets, "Автовыбор:", firstSheet);
          
          // ШАГ 2: Автоматически вызываем getRange для первого листа
          // Используем ref для sendMessage чтобы не добавлять в зависимости
          if (sendMessageRef.current) {
            setTimeout(() => {
              sendMessageRef.current?.({
                text: `Покажи таблицу из листа ${firstSheet}, диапазон A1:H30`,
              }).catch((err) => {
                console.error("❌ [xlsx] Ошибка при автоматическом вызове getRange после getSheets:", err);
              });
            }, 200); // Небольшая задержка чтобы модель успела обработать getSheets
          }
        }
      }
    }

    // Обработка getRange
    for (const { toolCallId, output } of newXlsxToolResults.getRangeResults) {
      // Дедупликация: проверяем, не обработан ли уже
      if (appliedToolCalls.current.has(`getRange-${toolCallId}`)) {
        continue;
      }
      appliedToolCalls.current.add(`getRange-${toolCallId}`);
      
      if (output?.sheet && output?.data && Array.isArray(output.data)) {
        // Парсим range (например "A1:H30") в from и to
        const rangeMatch = (output.range || "").match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        const from = rangeMatch ? rangeMatch[1] : "A1";
        const to = rangeMatch ? rangeMatch[2] : "H30";
        
        // Обрезаем пустые строки и столбцы справа и снизу
        const trimmed = trimSpreadsheetData(output.data, output.headers);
        
        // Если после обрезки данные пустые
        if (trimmed.data.length === 0) {
          console.log("📊 [xlsx] Диапазон пустой после обрезки");
          setSpreadsheetData({
            sheet: output.sheet,
            range: output.range || "",
            data: [],
            headers: [],
          });
          continue; // Исправлено: return -> continue
        }
        
        // ШАГ 1: Сохраняем контекст для следующего открытия (только если изменился)
        // Защита от бесконечных ререндеров: обновляем только если значения реально изменились
        setLastSpreadsheetContext((prev) => {
          const next = {
            sheet: output.sheet,
            from,
            to,
          };
          // Строгая проверка: обновляем только если хотя бы одно поле изменилось
          if (prev && prev.sheet === next.sheet && prev.from === next.from && prev.to === next.to) {
            return prev; // Возвращаем тот же объект, чтобы не триггерить ререндер
          }
          console.log("📊 [xlsx] Сохранён контекст:", next);
          return next;
        });
        
        setSpreadsheetData({
          sheet: output.sheet,
          range: output.range || "",
          data: trimmed.data,
          headers: trimmed.headers,
        });
        console.log("📊 [xlsx] Таблица открыта:", output.sheet, output.range);
        console.log("📊 [xlsx] Размер после обрезки:", {
          rows: trimmed.data.length,
          cols: trimmed.data[0]?.length || 0,
          originalRows: output.data.length,
          originalCols: output.data[0]?.length || 0,
        });
      }
    }

    // Обработка updateCell - ШАГ 3: Автоматический refetch после обновления
    for (const { toolCallId, output } of newXlsxToolResults.updateCellResults) {
      // Дедупликация: проверяем, не обработан ли уже
      if (appliedToolCalls.current.has(`updateCell-${toolCallId}`)) {
        continue;
      }
      appliedToolCalls.current.add(`updateCell-${toolCallId}`);
      
      if (output?.ok === true) {
        console.log("✅ [xlsx] Ячейка обновлена:", output.message);
        // ШАГ 3: Автоматически обновляем таблицу после успешного updateCell
        const context = lastSpreadsheetContextRef.current;
        if (context && sendMessageRef.current) {
          // Вызываем getRange по последнему открытому контексту для пересчета формул
          // Используем setTimeout чтобы избежать проблем с async в useEffect
          setTimeout(() => {
            sendMessageRef.current?.({
              text: `Обнови таблицу ${context.sheet}!${context.from}:${context.to}`,
            }).catch((err) => {
              console.error("❌ [xlsx] Ошибка при обновлении таблицы после updateCell:", err);
            });
          }, 100);
        }
      }
    }
  }, [newXlsxToolResults]); // Зависимости: только newXlsxToolResults (стабильный useMemo)

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
          messages.map((m: UIMessage) => (
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
                  {/* Рендерим text parts */}
                  {getText(m)}
                  
                  {/* Рендерим tool parts для assistant сообщений */}
                  {m.role === "assistant" &&
                    m.parts
                      ?.filter(isToolPart)
                      .map((part: any, idx: number) => {
                        const toolName = getToolName(part);
                        const toolCallId = part?.toolCallId;

                        // ШАГ C: Временный debug рендер всех tool parts
                        if (part?.toolCallId || part?.toolName || part?.state) {
                          return (
                            <details key={`tool-debug-${toolCallId || idx}`} style={{ marginTop: 8, padding: 8, background: "rgba(255,200,0,0.1)", border: "1px solid rgba(255,200,0,0.3)", borderRadius: 4 }}>
                              <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🔧 TOOL DEBUG: {toolName || "unknown"}</summary>
                              <pre style={{ fontSize: 10, overflow: "auto", maxHeight: "200px", marginTop: 8 }}>{JSON.stringify(part, null, 2)}</pre>
                            </details>
                          );
                        }

                        // askForConfirmation - ШАГ 4: дедупликация
                        if (toolName === "askForConfirmation") {
                          const message = part?.input?.message || "Подтвердите действие";
                          const state = part?.state;

                          // Показываем карточку только если input доступен, нет output и еще не обработано
                          if (state === "input-available" && !part?.output && toolCallId && !handledConfirmations.current.has(toolCallId)) {
                            return (
                              <ConfirmationCard
                                key={`confirmation-${toolCallId}-${idx}`}
                                message={message}
                                toolCallId={toolCallId}
                                onConfirm={(confirmed) => {
                                  // Помечаем как обработанное СРАЗУ
                                  handledConfirmations.current.add(toolCallId);
                                  addToolResult({
                                    tool: "askForConfirmation" as any,
                                    toolCallId,
                                    output: { confirmed: confirmed ? "confirmed" : "denied" },
                                  });
                                }}
                              />
                            );
                          }
                        }

                        // getLocation
                        if (toolName === "getLocation") {
                          return (
                            <LocationCard
                              key={`location-${toolCallId}-${idx}`}
                              part={part}
                            />
                          );
                        }

                        // requestDangerousActionConfirmation - ШАГ 4: дедупликация
                        if (toolName === "requestDangerousActionConfirmation") {
                          const question = part?.input?.question || "Подтвердите действие";
                          const state = part?.state;

                          // Показываем карточку только если input доступен, нет output и еще не обработано
                          if (state === "input-available" && !part?.output && toolCallId && !handledConfirmations.current.has(toolCallId)) {
                            return (
                              <DangerousActionConfirmationCard
                                key={`dangerous-confirmation-${toolCallId}-${idx}`}
                                question={question}
                                toolCallId={toolCallId}
                                onConfirm={(decision) => {
                                  // Помечаем как обработанное СРАЗУ
                                  handledConfirmations.current.add(toolCallId);
                                  addToolResult({
                                    tool: "requestDangerousActionConfirmation" as any,
                                    toolCallId,
                                    output: { decision },
                                  });
                                }}
                              />
                            );
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

                        // getRange - обработка вынесена в useEffect, таблица отображается через SpreadsheetView
                        if (toolName === "getRange") {
                          // UI рендеринг не требуется, обработка в useEffect (SpreadsheetView)
                          return null;
                        }

                        return null;
                      })}
                </div>
              </div>
            </div>
          ))
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
            <SpreadsheetView
              sheet={spreadsheetData.sheet}
              range={spreadsheetData.range}
              data={spreadsheetData.data}
              headers={spreadsheetData.headers}
              onRangeSelect={(mention) => {
                // ШАГ 4: Вставка меншона в поле ввода
                setText((prev) => {
                  const trimmed = prev.trim();
                  return trimmed ? `${trimmed} ${mention}` : mention;
                });
              }}
              onEditCell={async (sheet, cell, value) => {
                // ШАГ 3: Оптимистичное обновление
                setSpreadsheetData((prev) => {
                  if (!prev) return prev;
                  // Парсим cell address (например "C2") в координаты
                  const match = cell.match(/^([A-Z]+)(\d+)$/);
                  if (!match) return prev;
                  const colStr = match[1];
                  const rowNum = parseInt(match[2], 10);
                  
                  // Конвертируем колонку в индекс
                  let col = 0;
                  for (let i = 0; i < colStr.length; i++) {
                    col = col * 26 + (colStr.charCodeAt(i) - 64);
                  }
                  col -= 1;
                  
                  // Если есть headers, rowNum - 2, иначе rowNum - 1
                  const hasHeaders = prev.headers && prev.headers.length > 0;
                  const rowIdx = hasHeaders ? rowNum - 2 : rowNum - 1;
                  
                  if (rowIdx >= 0 && rowIdx < prev.data.length && col >= 0 && col < prev.data[rowIdx].length) {
                    const newData = prev.data.map((r, rIdx) =>
                      rIdx === rowIdx ? r.map((c, cIdx) => (cIdx === col ? value : c)) : r
                    );
                    return { ...prev, data: newData };
                  }
                  return prev;
                });

                // Отправляем команду на обновление через модель (с подтверждением)
                await sendMessage({
                  text: `Обнови ячейку ${sheet}!${cell} на значение: ${value}`,
                });
              }}
            />
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
        <form
          onSubmit={async (ev) => {
            ev.preventDefault();
            setLocalError("");

            const value = text.trim();
            if (!value || isLoading) return;

            try {
              console.log("📤 [sendMessage] Отправка сообщения пользователя:", value);
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
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: 12,
              border: "1px solid rgba(100,150,255,0.3)",
              background: isLoading
                ? "rgba(100,150,255,0.2)"
                : "rgba(100,150,255,0.3)",
              color: "inherit",
              cursor: isLoading || !text.trim() ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 500,
              opacity: isLoading || !text.trim() ? 0.5 : 1,
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
            // Отправляем команду на удаление с реальным ID сообщения
            const deleteCommand = `Удалить сообщение ${contextMenu.messageId}`;
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