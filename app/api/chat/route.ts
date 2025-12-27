import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";
import { appendDbMessage, getThread, createThread, getMessages } from "@/lib/db/chat-store";
import { chatTools } from "@/lib/tools/chat-tools";
import { serverTools } from "@/lib/tools/server-tools";
import { xlsxTools } from "@/lib/tools/xlsx-tools";
import type { UIMessage } from "ai";

export const maxDuration = 60;

// Helper для преобразования сообщений из БД в UIMessage
function loadChat(threadId: string): UIMessage[] {
  const dbMessages = getMessages(threadId);
  return dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    parts: [
      {
        type: "text",
        text: msg.content,
      },
    ],
    createdAt: new Date(msg.created_at),
  })) as UIMessage[];
}

// Helper для ошибок в формате UIMessage stream (SSE)
function errorToUIMessageStream(errorMessage: string, status: number = 500): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Отправляем error chunk в формате, который понимает useChat
      const errorChunk = JSON.stringify({
        type: "error",
        error: errorMessage,
      });
      controller.enqueue(encoder.encode(`data: ${errorChunk}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

export async function POST(req: Request) {
  try {
    console.log("🔵 [api/chat] ========== ЭТАП 1: ПОЛУЧЕНИЕ ЗАПРОСА ==========");
    const body = await req.json();
    console.log("🔵 [api/chat] Тело запроса (ключи):", Object.keys(body));
    console.log("🔵 [api/chat] Тело запроса (полное):", JSON.stringify(body, null, 2).substring(0, 1000));
    
    const threadId = body.threadId ?? body.id ?? body.data?.threadId;
    
    if (!threadId) {
      console.error("🔵 [api/chat] ЭТАП 1: ОШИБКА - ThreadId не найден в запросе:", Object.keys(body));
      return errorToUIMessageStream("threadId is required", 400);
    }
    
    console.log("🔵 [api/chat] ЭТАП 1: ThreadId найден:", threadId);

    // Источник истории: body.messages как source of truth, fallback на loadChat
    const originalMessages: UIMessage[] = body.messages && body.messages.length > 0 
      ? body.messages 
      : loadChat(threadId);
    
    console.log("🔵 [api/chat] ЭТАП 2: ОБРАБОТКА СООБЩЕНИЙ");
    console.log("🔵 [api/chat] Original messages count:", originalMessages.length);
    console.log("🔵 [api/chat] Источник:", body.messages && body.messages.length > 0 ? "body.messages" : "loadChat(threadId)");

    // Проверяем существование thread и создаем его, если нужно
    let thread = getThread(threadId);
    if (!thread) {
      console.log("🔵 [api/chat] Thread не найден, создаем новый...");
      // Создаем thread с заголовком из последнего пользовательского сообщения
      const lastUserMsg = originalMessages
        .filter((m: any) => {
          const content = (m.parts?.find((p: any) => p.type === "text")?.text) || "";
          return content && typeof content === "string" && content.trim().length > 0 && m.role === "user";
        })
        .pop();
      
      const title = lastUserMsg
        ? ((lastUserMsg.parts?.find((p: any) => p.type === "text") as any)?.text || "Новый чат")
            .trim()
            .substring(0, 100)
        : "Новый чат";
      
      createThread(title, threadId);
      console.log("🔵 [api/chat] Thread создан:", { threadId, title: title.substring(0, 50) });
    } else {
      console.log("🔵 [api/chat] Thread найден:", thread.title);
    }

    // Преобразуем UIMessage[] в ModelMessage[] для streamText
    console.log("🔵 [api/chat] ЭТАП 3: ПРЕОБРАЗОВАНИЕ В MODEL MESSAGES");
    const modelMessages = await convertToModelMessages(originalMessages);
    console.log("🔵 [api/chat] Преобразовано в model messages:", modelMessages.length);
    console.log("🔵 [api/chat] Пример model messages:", JSON.stringify(modelMessages.slice(-2), null, 2));
    
    // Проверяем, что есть сообщения
    if (!modelMessages || modelMessages.length === 0) {
      console.error("🔴 [api/chat] Нет сообщений после конвертации");
      return errorToUIMessageStream("Не удалось обработать сообщения. Проверьте формат данных.", 400);
    }

    // Сохраняем user-сообщение только если последний UIMessage имеет role === "user"
    const lastUIMessage = originalMessages[originalMessages.length - 1];
    if (lastUIMessage && lastUIMessage.role === "user") {
      const userContent = (lastUIMessage.parts?.find((p: any) => p.type === "text") as any)?.text || "";
      
      if (userContent.trim()) {
        console.log("🔵 [api/chat] Сохранение сообщения пользователя:", userContent.substring(0, 50));
        appendDbMessage({
          threadId,
          role: "user",
          content: userContent,
        });
      }
    }

    // Проверяем наличие API ключа
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_api_key_here") {
      console.error("🔴 [api/chat] OPENAI_API_KEY не настроен");
      return errorToUIMessageStream("OpenAI API key не настроен. Пожалуйста, добавьте OPENAI_API_KEY в файл .env.local", 500);
    }

    // Объединяем tools (включая xlsxTools для диагностики)
    const allTools = {
      ...chatTools,
      ...serverTools,
      ...xlsxTools,
    };

    // ШАГ A: Лог списка tools
    console.log("🔵 [api/chat] Tools keys:", Object.keys(allTools));

    // ШАГ 1: Получаем spreadsheetContext из body
    const spreadsheetContext = body.spreadsheetContext || null;
    console.log("🔵 [api/chat] ШАГ 5: spreadsheetContext получен:", JSON.stringify(spreadsheetContext, null, 2));
    
    // Защита от null при использовании в template string
    const contextSheet = spreadsheetContext?.sheet || "Sheet1";
    const contextFrom = spreadsheetContext?.from || "A1";
    const contextTo = spreadsheetContext?.to || "H30";

    // System prompt для 2-этапной логики опасных действий и таблиц
    const systemPrompt = `Ты полезный ассистент.

ВАЖНО: Для опасных действий (удаление, обновление) используй 2-этапную логику:
1. Сначала вызови requestDangerousActionConfirmation с вопросом для пользователя (question, action, targetId, threadId?, newContent?)
2. Дождись ответа пользователя (decision: "yes" или "no")
3. Если decision === "yes" — вызови performDangerousAction с теми же параметрами
4. Если decision === "no" — ответь "Ок, отменено." и НЕ вызывай performDangerousAction

Никогда не вызывай performDangerousAction без предварительного вызова requestDangerousActionConfirmation.

Для показа таблицы сообщений треда:
1. Если пользователь просит "покажи таблицу сообщений" или "покажи сообщения в виде таблицы" — вызови getThreadMessagesTable с threadId
2. Затем вызови openTable с title (например, "Сообщения треда") и threadId
3. Всегда пиши короткий текст в ответе (например, "Вот таблица сообщений треда:").

Для работы с XLSX файлом (example.xlsx):
КРИТИЧЕСКИ ВАЖНО: Если пользователь просит "открой таблицу", "покажи таблицу", "example.xlsx" или упоминает Excel/таблицу БЕЗ указания конкретных параметров:
1. НЕ задавай уточняющих вопросов (какой файл/лист/диапазон)
2. Если есть spreadsheetContext (из предыдущего открытия):
   - СРАЗУ вызови getRange с параметрами из контекста: sheet=${contextSheet}, from=${contextFrom}, to=${contextTo}
   - НЕ вызывай getSheets если уже есть контекст
3. Если НЕТ spreadsheetContext:
   - СРАЗУ вызови getRange с дефолтами: sheet="Sheet1", from="A1", to="H30"
   - НЕ вызывай getSheets - tool getRange сам подставит дефолты
   - Если getRange вернёт ошибку "Sheet not found" - тогда вызови getSheets и повтори getRange с правильным листом
4. После вызова getRange таблица автоматически отобразится в UI
5. Всегда пиши короткий текст в ответе (например, "Вот таблица из example.xlsx:").

Если пользователь явно указывает параметры (например "Sheet2 A1:B10") - используй их.

Для работы с меншонами диапазонов (формат @Sheet1!A1:B3):
1. Если пользователь упоминает диапазон в формате @Sheet1!A1:B3 или @Sheet1!A1 - это ссылка на ячейки в таблице
2. Парси формат: @<SheetName>!<CellOrRange>
   - Пример: @Sheet1!A1 - одна ячейка A1 на листе Sheet1
   - Пример: @Sheet1!A1:B3 - диапазон от A1 до B3 на листе Sheet1
3. Используй эти параметры для вызова tools:
   - getRange: извлеки sheet, from (начальная ячейка), to (конечная ячейка или та же, если одна)
   - explainFormula: извлеки sheet и cell (ячейка)
   - updateCell: извлеки sheet, cell и value из запроса пользователя
4. Примеры использования:
   - "Объясни формулу в @Sheet1!D4" → explainFormula({ sheet: "Sheet1", cell: "D4" })
   - "Покажи данные из @Sheet1!A1:B3" → getRange({ sheet: "Sheet1", from: "A1", to: "B3" })
   - "Возьми email из @Sheet1!B2:B5" → getRange({ sheet: "Sheet1", from: "B2", to: "B5" }), затем обработай данные
   - "Измени @Sheet1!C2 на 100" → сначала requestDangerousActionConfirmation, затем performDangerousAction с updateXlsxCell`;

    console.log("🔵 [api/chat] ЭТАП 4: ВЫЗОВ streamText");
    console.log("🔵 [api/chat] Количество сообщений для отправки:", modelMessages.length);
    console.log("🔵 [api/chat] Tools count:", Object.keys(allTools).length);
    
    try {
      const result = await streamText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        messages: modelMessages,
        tools: Object.keys(allTools).length > 0 ? allTools : undefined,
      });

      console.log("🔵 [api/chat] ЭТАП 5: СОЗДАНИЕ UIMESSAGE STREAM RESPONSE");
      // В AI SDK 6.0 используем toUIMessageStreamResponse для совместимости с useChat
      const response = result.toUIMessageStreamResponse({
        originalMessages,
        onFinish: async ({ messages, responseMessage }) => {
          // Находим последнее assistant сообщение с текстом
          const lastAssistantMsg = responseMessage || messages
            .filter((m: any) => m.role === "assistant")
            .pop();
          
          if (lastAssistantMsg) {
            const textPart = lastAssistantMsg.parts?.find((p: any) => p.type === "text");
            const text = (textPart as any)?.text || "";
            
            console.log("🔵 [api/chat] onFinish text len:", text?.length ?? 0);
            console.log("🔵 [api/chat] onFinish в toUIMessageStreamResponse, текст:", text?.substring(0, 100));
            
            // Сохраняем только последний assistant текст (tool parts не сохраняем)
            if (text && text.trim()) {
              appendDbMessage({
                threadId,
                role: "assistant",
                content: text,
              });
            }
          }
        },
      });
      
      console.log("🔵 [api/chat] ЭТАП 6: ОТПРАВКА ОТВЕТА, статус:", response.status);
      console.log("🔵 [api/chat] Заголовки ответа:", Object.fromEntries(response.headers.entries()));
      return response;
    } catch (streamError) {
      console.error("🔴 [api/chat] Ошибка в streamText:", streamError);
      console.error("🔴 [api/chat] Детали ошибки:", {
        name: streamError instanceof Error ? streamError.name : "Unknown",
        message: streamError instanceof Error ? streamError.message : String(streamError),
        stack: streamError instanceof Error ? streamError.stack : undefined,
      });
      throw streamError; // Пробрасываем дальше для общего catch
    }
  } catch (error) {
    console.error("🔴 [api/chat] ========== ОШИБКА ==========");
    console.error("🔴 [api/chat] Тип ошибки:", error?.constructor?.name);
    console.error("🔴 [api/chat] Сообщение:", error instanceof Error ? error.message : String(error));
    console.error("🔴 [api/chat] Стек:", error instanceof Error ? error.stack : "Нет стека");
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorToUIMessageStream(errorMessage, 500);
  }
}
