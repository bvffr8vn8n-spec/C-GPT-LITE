import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";
import { appendDbMessage, getThread, createThread, getMessages, generateId } from "@/lib/db/chat-store";
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
    
    // ДИАГНОСТИКА: Детальный анализ формата сообщений от клиента
    if (body.messages && Array.isArray(body.messages)) {
      console.log("🔍 [FORMAT-CHECK] Формат сообщений от клиента (useChat):");
      console.log(`  Всего сообщений: ${body.messages.length}`);
      body.messages.forEach((msg: any, i: number) => {
        console.log(`  [${i}] role: ${msg.role}, id: ${msg.id}`);
        if (msg.parts && Array.isArray(msg.parts)) {
          console.log(`    parts count: ${msg.parts.length}`);
          msg.parts.forEach((part: any, j: number) => {
            console.log(`      [${j}] type: ${part.type}, toolCallId: ${part.toolCallId || 'N/A'}`);
            if (part.type?.startsWith('tool-')) {
              console.log(`        hasInput: ${!!part.input}, hasOutput: ${!!part.output}, hasResult: ${!!part.result}`);
              console.log(`        output: ${part.output}, result: ${part.result}, state: ${part.state}`);
            }
          });
        } else {
          console.log(`    content: ${typeof msg.content === 'string' ? msg.content.substring(0, 50) : 'array/object'}`);
        }
      });
    }
    
    const threadId = body.threadId ?? body.id ?? body.data?.threadId;
    
    if (!threadId) {
      console.error("🔵 [api/chat] ЭТАП 1: ОШИБКА - ThreadId не найден в запросе:", Object.keys(body));
      return errorToUIMessageStream("threadId is required", 400);
    }
    
    console.log("🔵 [api/chat] ЭТАП 1: ThreadId найден:", threadId);

    // Источник истории: body.messages как source of truth, fallback на loadChat
    const rawMessages: UIMessage[] = body.messages && body.messages.length > 0 
      ? body.messages 
      : loadChat(threadId);
    
    // FIX: Нормализуем сообщения - добавляем parts для сообщений без parts
    const originalMessages: UIMessage[] = rawMessages.map((msg: any) => {
      // Если у сообщения уже есть parts, возвращаем как есть
      if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
        return msg;
      }
      
      // Если parts нет, создаём его из content
      const content = msg.content || "";
      const parts = typeof content === "string" 
        ? [{ type: "text", text: content }]
        : Array.isArray(content)
        ? content
        : [];
      
      return {
        ...msg,
        parts,
      };
    });
    
    console.log("🔵 [api/chat] ЭТАП 2: ОБРАБОТКА СООБЩЕНИЙ");
    console.log("🔵 [api/chat] Original messages count:", originalMessages.length);
    console.log("🔵 [api/chat] Источник:", body.messages && body.messages.length > 0 ? "body.messages" : "loadChat(threadId)");
    
    // Диагностика для авто-продолжения (sendAutomaticallyWhen)
    const toolMessagesInOriginal = originalMessages.filter((m: any) => {
      // Проверяем наличие role === "tool" в parts
      if (m.role === "tool") return true;
      // Или tool-result в assistant message parts
      if (m.role === "assistant" && m.parts) {
        return m.parts.some((p: any) => p.type === "tool-result" || (p.type?.startsWith("tool-") && p.output));
      }
      return false;
    });
    console.log("🔵 [api/chat] Tool results в original messages:", toolMessagesInOriginal.length > 0 ? "✅ ЕСТЬ" : "❌ НЕТ");
    if (toolMessagesInOriginal.length > 0) {
      console.log("🔵 [api/chat] Tool results детали:", toolMessagesInOriginal.map((m: any) => ({
        role: m.role,
        toolCallId: m.toolCallId || m.parts?.find((p: any) => p.toolCallId)?.toolCallId,
        hasOutput: !!m.output || !!m.parts?.find((p: any) => p.output),
        output: m.output || m.parts?.find((p: any) => p.output)?.output,
        parts: m.parts?.filter((p: any) => p.type?.startsWith("tool-")).map((p: any) => ({
          type: p.type,
          toolCallId: p.toolCallId,
          hasOutput: !!p.output,
          output: p.output,
        })),
      })));
    }
    
    // FIX: Специальная диагностика для askForConfirmation в original messages
    const askForConfirmationInOriginal = originalMessages.flatMap((m: any) => {
      if (m.role === "assistant" && m.parts) {
        return m.parts.filter((p: any) => 
          p.type === "tool-askForConfirmation" || p.type?.includes("askForConfirmation")
        ).map((p: any) => ({
          messageId: m.id,
          toolCallId: p.toolCallId,
          hasOutput: !!p.output,
          output: p.output,
          state: p.state,
        }));
      }
      return [];
    });
    if (askForConfirmationInOriginal.length > 0) {
      console.log("🔵 [api/chat] askForConfirmation в original messages:", askForConfirmationInOriginal);
    }
    
    // FIX: Вычищаем незавершённые tool-call parts перед convertToModelMessages
    // Это 100% уберёт 400 "No tool output found" даже если в БД уже лежит "висяк"
    function pruneIncompleteToolCalls(messages: any[]) {
      // Сначала собираем все toolCallId с финальными результатами (без pending)
      const completedToolCallIds = new Set<string>();
      messages.forEach((m: any) => {
        if (m.role === 'assistant' && Array.isArray(m.parts)) {
          m.parts.forEach((p: any) => {
            if (typeof p?.type === 'string' && p.type.startsWith('tool-')) {
              const output = p.output ?? p.result;
              if (output && !output.pending && p.toolCallId) {
                completedToolCallIds.add(p.toolCallId);
              }
            }
          });
        }
      });
      
      return messages
        .map(m => {
          if (m.role !== 'assistant' || !Array.isArray(m.parts)) return m;

          const parts = m.parts.filter((p: any) => {
            const isToolPart = typeof p?.type === 'string' && p.type.startsWith('tool-');
            if (!isToolPart) return true;

            // FIX: AI SDK может класть результат как output или result
            const hasToolData = (p.output ?? p.result) !== undefined && (p.output ?? p.result) !== null;
            
            // FIX: Pending results НЕ считаются завершёнными - выкидываем их
            // НО: если есть финальный результат (без pending), оставляем его
            if (hasToolData) {
              const output = p.output ?? p.result;
              
              // FIX: Для строковых результатов (например, "yes"/"no" для askForConfirmation) - это всегда финальный результат
              if (typeof output === 'string' && (output === 'yes' || output === 'no')) {
                console.log("✅ [api/chat] Оставляем строковый tool result (askForConfirmation):", {
                  type: p.type,
                  toolCallId: p.toolCallId,
                  toolName: p.toolName,
                  result: output,
                });
                return true; // Строковые "yes"/"no" - это финальный результат
              }
              
              // FIX: Для строковых output (например, "yes"/"no" для askForConfirmation) проверяем pending только если output - объект
              const isPending = output && typeof output === "object" && (output.pending === true || output.pending === "true");
              if (isPending) {
                console.warn("⚠️ [api/chat] Фильтруем pending tool result (не завершён):", {
                  type: p.type,
                  toolCallId: p.toolCallId,
                  toolName: p.toolName,
                  state: p.state,
                });
                return false; // Выкидываем pending results
              }
              // Если есть финальный результат (без pending), оставляем его
              // Это позволит convertToModelMessages правильно связать tool-result с tool-call
              console.log("✅ [api/chat] Оставляем финальный tool result:", {
                type: p.type,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                state: p.state,
                hasOutput: !!p.output,
                hasResult: !!p.result,
              });
              return true;
            }
            
            // FIX: Если tool-call без output/result, но есть финальный результат с этим toolCallId (в этом же или другом сообщении) - оставляем его
            // Это нужно для того, чтобы convertToModelMessages мог связать tool-call с tool-result
            // ВАЖНО: оставляем tool-call даже для UI tools, если есть финальный результат, чтобы convertToModelMessages мог правильно связать их
            if (!hasToolData && p.toolCallId && completedToolCallIds.has(p.toolCallId)) {
              console.log("✅ [api/chat] Оставляем незавершённый tool-call, т.к. есть финальный результат:", {
                type: p.type,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
              });
              return true; // Оставляем tool-call, если есть финальный результат
            }
            
            // выкидываем tool-call без output/result (input-available / input-streaming / undefined)
              console.warn("⚠️ [api/chat] Фильтруем незавершённый tool-call part:", {
                type: p.type,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                state: p.state,
                hasOutput: p.output != null,
                hasResult: p.result != null,
              hasCompletedResult: p.toolCallId ? completedToolCallIds.has(p.toolCallId) : false,
              });
            return false; // Выкидываем незавершённые tool-call без финального результата
          });

          // если стало пусто и текста нет — выкидываем сообщение вообще
          const hasText =
            (typeof m.content === 'string' && m.content.trim().length > 0) ||
            (Array.isArray(m.content) && m.content.some((x: any) => x?.type === 'text' && x?.text?.trim())) ||
            (Array.isArray(m.parts) && m.parts.some((p: any) => p?.type === 'text' && p?.text?.trim()));

          return { ...m, parts, _drop: !hasText && parts.length === 0 };
        })
        .filter(m => !m._drop);
    }
    
    const cleanedMessages = pruneIncompleteToolCalls(originalMessages);
    console.log("🔵 [api/chat] Очищено сообщений:", {
      original: originalMessages.length,
      cleaned: cleanedMessages.length,
    });
    
    // ДИАГНОСТИКА: Проверяем дубликаты toolCallId в исходных сообщениях
    const toolCallIds = new Map<string, number>();
    cleanedMessages.forEach((msg: any) => {
      if (msg.parts && Array.isArray(msg.parts)) {
        msg.parts.forEach((part: any) => {
          if (part.toolCallId) {
            const count = toolCallIds.get(part.toolCallId) || 0;
            toolCallIds.set(part.toolCallId, count + 1);
            if (count > 0) {
              console.warn(`⚠️ [DEDUP-CHECK] Дубликат toolCallId в исходных сообщениях: ${part.toolCallId} (встречается ${count + 1} раз)`);
            }
          }
        });
      }
    });

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
    console.log("🔵 [api/chat] Cleaned messages count:", cleanedMessages.length);
    console.log("🔵 [api/chat] Cleaned messages (последние 2):", JSON.stringify(cleanedMessages.slice(-2).map(m => ({
      role: m.role,
      id: m.id,
      partsCount: m.parts?.length || 0,
      parts: m.parts?.map((p: any) => ({
        type: p.type,
        toolName: p.toolName,
        toolCallId: p.toolCallId,
        state: p.state,
        hasOutput: !!p.output,
        hasResult: !!p.result,
      })) || [],
    })), null, 2));
    
    // (A) Диагностика: логируем incoming assistant tool parts перед convertToModelMessages
    const incomingToolParts = cleanedMessages.flatMap((m: any) =>
      m.role === "assistant" && Array.isArray(m.parts)
        ? m.parts.filter((p: any) => String(p.type || "").startsWith("tool-")).map((p: any) => ({
            type: p.type,
            toolCallId: p.toolCallId,
            hasOutput: p.output != null,
            hasResult: p.result != null,
            output: p.output,
            result: p.result,
            state: p.state,
          }))
        : []
    );
    console.log("[debug] incoming assistant tool parts:", incomingToolParts);
    
    // FIX: Специальная диагностика для askForConfirmation
    const askForConfirmationParts = incomingToolParts.filter((p: any) => 
      p.type === "tool-askForConfirmation" || p.type?.includes("askForConfirmation")
    );
    if (askForConfirmationParts.length > 0) {
      console.log("🔵 [api/chat] askForConfirmation parts найдены:", askForConfirmationParts.map((p: any) => ({
        toolCallId: p.toolCallId,
        hasOutput: p.hasOutput,
        output: p.output,
        state: p.state,
      })));
    }

    // ✅ ПРАВИЛЬНЫЙ ПОДХОД: Просто используем convertToModelMessages без "ремонта"
    // convertToModelMessages сам правильно преобразует tool results в tool messages
    const modelMessages = await convertToModelMessages(cleanedMessages);
    console.log("🔵 [api/chat] Преобразовано в model messages:", modelMessages.length);
    console.log("🔵 [api/chat] Пример model messages:", JSON.stringify(modelMessages.slice(-2), null, 2));
    
    // FIX: Дедупликация сообщений по id (для предотвращения ошибки "Duplicate item found with id")
    const seenIds = new Set<string>();
    const deduplicatedMessages = modelMessages.filter((msg: any) => {
      // Для tool messages используем tool_call_id как уникальный идентификатор
      if (msg.role === "tool" && msg.tool_call_id) {
        if (seenIds.has(msg.tool_call_id)) {
          console.warn("⚠️ [api/chat] Дубликат tool message с tool_call_id:", msg.tool_call_id);
          return false;
        }
        seenIds.add(msg.tool_call_id);
        return true;
      }
      // Для других сообщений используем id, если он есть
      if (msg.id) {
        if (seenIds.has(msg.id)) {
          console.warn("⚠️ [api/chat] Дубликат сообщения с id:", msg.id);
          return false;
        }
        seenIds.add(msg.id);
        return true;
      }
      // Если нет id, оставляем сообщение (но это не должно происходить)
      return true;
    });
    
    if (deduplicatedMessages.length !== modelMessages.length) {
      console.warn("⚠️ [api/chat] Удалено дубликатов:", modelMessages.length - deduplicatedMessages.length);
    }
    
    // Проверяем, что есть сообщения
    if (!deduplicatedMessages || deduplicatedMessages.length === 0) {
      console.error("🔴 [api/chat] Нет сообщений после конвертации и дедупликации");
      return errorToUIMessageStream("Не удалось обработать сообщения. Проверьте формат данных.", 400);
    }

    // Сохраняем user-сообщение: ищем последнее user сообщение, которое ещё не сохранено в БД
    const lastUserMessage = originalMessages
      .filter((m: any) => m.role === "user")
      .pop();
    
    if (lastUserMessage) {
      const userContent = (lastUserMessage.parts?.find((p: any) => p.type === "text") as any)?.text || "";
      
      if (userContent.trim()) {
        try {
          console.log("💾 [api/chat] Попытка сохранить сообщение пользователя:", userContent.substring(0, 50));
  appendDbMessage({
    threadId,
    role: "user",
            content: userContent,
            id: lastUserMessage.id, // Сохраняем тот же ID
          });
          console.log("✅ [api/chat] Сообщение пользователя успешно сохранено");
        } catch (error: any) {
          // Если сообщение уже существует - это нормально, продолжаем работу
          console.log("⚠️ [api/chat] Сообщение пользователя уже существует или ошибка:", error?.message);
        }
      } else {
        console.warn("⚠️ [api/chat] Пустое сообщение пользователя, пропускаем сохранение");
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

Для подтверждения действий (askForConfirmation):
1. Если пользователь просит подтверждение ("спроси подтверждение", "ask for confirmation", "подтверди действие") - вызови askForConfirmation({ message: "..." }) с вопросом на русском.
2. После получения результата от пользователя (через addToolOutput) ОБЯЗАТЕЛЬНО ответь текстом:
   - Если результат "yes" → "Ок, подтверждено. [продолжи действие, если нужно]"
   - Если результат "no" → "Ок, отменено."
3. НЕ повторяй вопрос, не спрашивай снова - просто выполни пункт 2 и ответь текстом.

Для получения местоположения (getLocation):
1. Если пользователь просит местоположение ("где я", "мой адрес", "мои координаты", "get location", "get my location") - вызови getLocation({ reason: "..." }) с опциональной причиной на русском.
2. После получения результата от пользователя (через addToolOutput) ОБЯЗАТЕЛЬНО ответь текстом:
   - Если результат allowed: true → "Ок, разрешение получено. Вы находитесь в [city из result]. Координаты: широта [latitude из result], долгота [longitude из result]."
   - Если результат allowed: false → "Ок, доступ к местоположению отклонён."
3. НЕ повторяй запрос, не спрашивай снова - просто выполни пункт 2 и ответь текстом.
4. ВАЖНО: Всегда указывай город в ответе, если он есть в результате (result.city).

ВАЖНО: Для опасных действий (удаление, обновление) используй 2-этапную логику:
1. Сначала вызови requestDangerousActionConfirmation с вопросом для пользователя (question, action, targetId, threadId?, newContent?)
2. Дождись ответа пользователя через tool result: { confirmed: boolean }
   - confirmed: true означает, что пользователь нажал "Да"
   - confirmed: false означает, что пользователь нажал "Нет"
3. Если confirmed === true — СРАЗУ вызови performDangerousAction с теми же параметрами (action, targetId, threadId?, newContent?)
4. Если confirmed === false — ответь "Ок, отменено." и НЕ вызывай performDangerousAction
5. НИКОГДА не вызывай requestDangerousActionConfirmation повторно после получения confirmed: true/false
6. НИКОГДА не вызывай performDangerousAction без предварительного вызова requestDangerousActionConfirmation

КРИТИЧЕСКИ ВАЖНО: После получения { confirmed: true } от requestDangerousActionConfirmation - ОБЯЗАТЕЛЬНО вызови performDangerousAction в том же ответе, не жди следующего запроса пользователя!

Для показа таблицы сообщений треда:
1. Если пользователь просит "покажи таблицу сообщений" или "покажи сообщения в виде таблицы" — вызови getThreadMessagesTable с threadId
2. Затем вызови openTable с title (например, "Сообщения треда") и threadId
3. Всегда пиши короткий текст в ответе (например, "Вот таблица сообщений треда:").

Для работы с XLSX файлом (example.xlsx):
КРИТИЧЕСКИ ВАЖНО - ЗАПРЕТ ТЕКСТОВЫХ ТАБЛИЦ:
1. НИКОГДА не выводи таблицу в тексте (никаких markdown/ASCII таблиц типа "| Email | ...").
2. НИКОГДА не рисуй таблицу символами или форматированием.
3. Чтобы показать таблицу - ВСЕГДА вызывай getRange и отвечай коротко ("Открыл таблицу." или "Готово.").
4. Таблица автоматически отобразится в UI через SpreadsheetView после вызова getRange.

Если пользователь просит "открой таблицу", "покажи таблицу", "example.xlsx" или упоминает Excel/таблицу БЕЗ указания конкретных параметров:
1. НЕ задавай уточняющих вопросов (какой файл/лист/диапазон)
2. Если есть spreadsheetContext (из предыдущего открытия): СРАЗУ вызови getRange с sheet=${contextSheet}, from=${contextFrom}, to=${contextTo}
3. Если НЕТ spreadsheetContext: 
   - Сначала вызови getSheets({}) чтобы узнать доступные листы
   - Затем СРАЗУ вызови getRange с sheet="Sheet1" (или первый лист из getSheets), from и to НЕ указывай (tool автоматически определит используемый диапазон через detectUsedRange)
4. После вызова getRange таблица автоматически отобразится в UI через SpreadsheetView
5. ВСЕГДА пиши короткий текст в ответе (например, "Открыл таблицу." или "Готово.")

Если пользователь пишет диапазон @Sheet1!A1:D10 или Sheet1!A1:D10:
- Распарси формат: @<SheetName>!<CellOrRange>
- СРАЗУ вызови getRange с извлечёнными параметрами (sheet, from, to)
- НЕ выводи таблицу в тексте

Для изменения ячейки (например "B3 замени на Дима" или "@Sheet1!B3 замени на Дима"):
КРИТИЧЕСКИ ВАЖНО: НИКОГДА не используй requestDangerousActionConfirmation для изменения XLSX ячеек!
Вместо этого:
1. СРАЗУ вызови updateCell с параметрами:
   - sheet: имя листа (например "Sheet1", по умолчанию "Sheet1")
   - cell: адрес ячейки (например "B3" из @Sheet1!B3)
   - value: новое значение (например "Дима")
2. Tool updateCell вернёт { status: "needs_confirmation", confirmationId, sheet, cell, value, question }
3. Это закрывает tool-call и предотвращает ошибку "No tool output found"
4. Пользователь увидит подтверждение в UI и нажмёт "Да/Нет"
5. После подтверждения пользователя изменение выполнится автоматически через API
6. НЕ вызывай performDangerousAction для updateXlsxCell - это устаревший способ
7. НЕ вызывай requestDangerousActionConfirmation для updateXlsxCell - это вызовет ошибку "No tool output found"!
8. requestDangerousActionConfirmation доступен ТОЛЬКО для deleteThread, deleteMessage, updateMessage - НЕ для XLSX!

ВАЖНО: 
- getSheets вызывай ТОЛЬКО если пользователь явно просит "список листов", "какие листы есть", "покажи все листы" ИЛИ если нужно узнать листы перед getRange
- НИКОГДА не генерируй markdown/ASCII таблицы - всегда используй getRange tool

Если пользователь явно указывает параметры (например "Sheet2 A1:B10") - используй их.

Для работы с меншонами диапазонов (формат @Sheet1!A1:B3):
КРИТИЧЕСКИ ВАЖНО: Если в сообщении пользователя есть меншон в формате @Sheet!A1:B3 или @Sheet!A1 - ОБЯЗАТЕЛЬНО используй его для вызова соответствующего tool!

1. Парсинг формата: @<SheetName>!<CellOrRange>
   - Пример: @Sheet1!A1 - одна ячейка A1 на листе Sheet1
   - Пример: @Sheet1!A1:B3 - диапазон от A1 до B3 на листе Sheet1
   - Пример: @Sheet1!D4 - одна ячейка D4 на листе Sheet1
   
2. Правила парсинга:
   - Если формат @Sheet!A1 (одна ячейка): sheet="Sheet", from="A1", to="A1"
   - Если формат @Sheet!A1:B3 (диапазон): sheet="Sheet", from="A1", to="B3"
   - Если формат @Sheet!A1:B3:C5 - это НЕПРАВИЛЬНЫЙ формат, используй только @Sheet!A1:B3
   
3. ОБЯЗАТЕЛЬНО вызывай tools при обнаружении меншонов:
   - Если видишь @Sheet!A1:B3 в запросе "покажи данные из @Sheet1!A1:B3" → СРАЗУ вызови getRange({ sheet: "Sheet1", from: "A1", to: "B3" })
   - Если видишь @Sheet!A1 в запросе "объясни формулу в @Sheet1!D4" → СРАЗУ вызови explainFormula({ sheet: "Sheet1", cell: "D4" })
   - Если видишь @Sheet!A1 в запросе "измени @Sheet1!C2 на 100" → СРАЗУ вызови updateCell({ sheet: "Sheet1", cell: "C2", value: 100 })
   
4. Сценарий "взять email и отправить приглашения":
   КРИТИЧЕСКИ ВАЖНО: Если пользователь просит "отправить приглашение", "отправить приглашения", "send invitation", "send invites" и упоминает диапазон или ячейку с email - ОБЯЗАТЕЛЬНО используй logInvites tool!
   
   Алгоритм действий:
   - Если пользователь пишет "отправь приглашение на @Sheet1!A4" или "отправь приглашения на @Sheet1!B2:B5" или "возьми email из @Sheet1!B2:B5 и отправь приглашения":
     1. СРАЗУ вызови getRange с параметрами из меншона:
        - Для одной ячейки: getRange({ sheet: "Sheet1", from: "A4", to: "A4" })
        - Для диапазона: getRange({ sheet: "Sheet1", from: "B2", to: "B5" })
     2. Из полученных данных извлеки email адреса:
        - Структура данных: getRange возвращает { data: [[...], [...], ...] } - это 2D массив
        - Если это одна ячейка (A4) - возьми значение из data[0][0] (первая строка, первый столбец)
        - Если это диапазон (B2:B5) - извлеки все значения из массива data:
          * data - это массив строк, каждая строка - массив ячеек
          * Для диапазона B2:B5 (колонка B, строки 2-5): data будет содержать 4 строки, каждая с одним значением
          * Пройдись по всем строкам и столбцам в data, собери все непустые значения
        - Проверь, что значения являются валидными email адресами:
          * Значение должно быть строкой (typeof value === "string")
          * Значение должно содержать символ "@" (value.includes("@"))
          * Значение должно содержать точку после "@" (value.includes(".", value.indexOf("@")))
        - Отфильтруй пустые значения (null, undefined, пустые строки)
     3. ОБЯЗАТЕЛЬНО вызови logInvites({ emails: [...] }) с массивом валидных email адресов
        - emails должен быть массивом строк: ["email1@example.com", "email2@example.com"]
        - Если после фильтрации не осталось валидных email - сообщи пользователю об этом
     4. В ответе перечисли какие email "приглашены" в виде списка, например:
        "✅ Приглашения отправлены на следующие email адреса:
        1. email1@example.com
        2. email2@example.com
        Всего отправлено: 2 приглашения."
   
   Примеры команд, которые требуют вызова logInvites:
   - "отправь приглашение на @Sheet1!A4"
   - "отправь приглашения на @Sheet1!B2:B5"
   - "send invitation to @Sheet1!A4"
   - "возьми email из @Sheet1!B2:B5 и отправь приглашения"
   - "отправь приглашения на эти email @Sheet1!B2:B5"
   - "Возьми email из диапазона @Sheet1!B2:B5 и отправь им приглашения"
   
5. Примеры использования:
   - "Объясни формулу в @Sheet1!D4" → explainFormula({ sheet: "Sheet1", cell: "D4" })
   - "Покажи данные из @Sheet1!A1:B3" → getRange({ sheet: "Sheet1", from: "A1", to: "B3" })
   - "Возьми email из @Sheet1!B2:B5 и отправь им приглашения" → getRange({ sheet: "Sheet1", from: "B2", to: "B5" }), затем logInvites({ emails: [...] })
   - "Измени @Sheet1!C2 на 100" → updateCell({ sheet: "Sheet1", cell: "C2", value: 100 })
   
6. ВАЖНО: НЕ игнорируй меншоны! Если пользователь вставил @Sheet!A1:B3 в сообщение - это значит он хочет работать с этим диапазоном!

ЗАПРЕЩЕНО для XLSX:
- НИКОГДА не вызывай requestDangerousActionConfirmation с action="updateXlsxCell" - это вызовет ошибку!
- НИКОГДА не вызывай performDangerousAction с action="updateXlsxCell" - это устаревший способ!
- ВСЕГДА используй updateCell для изменения XLSX ячеек!
`;

    console.log("🔵 [api/chat] ЭТАП 4: ВЫЗОВ streamText");
    console.log("🔵 [api/chat] Количество сообщений для отправки:", deduplicatedMessages.length);
    console.log("🔵 [api/chat] Tools count:", Object.keys(allTools).length);
    console.log("🔵 [api/chat] Используем deduplicatedMessages:", {
      count: deduplicatedMessages.length,
      hasToolResult: deduplicatedMessages.some((m: any) => m.role === "tool"),
      toolMessagesCount: deduplicatedMessages.filter((m: any) => m.role === "tool").length,
    });
    
    // ДИАГНОСТИКА: Логируем все id и tool_call_id для выявления дубликатов
    console.log("🔍 [DEDUP-CHECK] Проверка дубликатов в сообщениях:");
    const allIds = new Map<string, number>();
    deduplicatedMessages.forEach((msg: any, idx: number) => {
      const id = msg.id || msg.tool_call_id || `no-id-${idx}`;
      const count = allIds.get(id) || 0;
      allIds.set(id, count + 1);
      if (count > 0) {
        console.error(`❌ [DEDUP-CHECK] ДУБЛИКАТ НАЙДЕН: id="${id}" встречается ${count + 1} раз!`);
      }
    });
    
    try {
      const result = await streamText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        messages: deduplicatedMessages, // ← Используем deduplicatedMessages вместо modelMessages
        tools: Object.keys(allTools).length > 0 ? allTools : undefined,
      });

      console.log("🔵 [api/chat] ЭТАП 5: СОЗДАНИЕ UIMESSAGE STREAM RESPONSE");
      
      // В AI SDK 6.0 используем toUIMessageStreamResponse для совместимости с useChat
      const response = result.toUIMessageStreamResponse({
        originalMessages: cleanedMessages,
        onFinish: async ({ messages, responseMessage }) => {
          // Сохранение сообщений в БД
          const lastAssistantMsg = responseMessage || messages
            .filter((m: any) => m.role === "assistant")
            .pop();
          
          if (lastAssistantMsg) {
            const partsToSave = lastAssistantMsg.parts || [];
            const textParts = partsToSave.filter((p: any) => p.type === "text") || [];
            const text = textParts.map((p: any) => p.text || "").join("\n").trim();
            const contentToSave = text || "Выполнено";
            
            try {
      appendDbMessage({
        threadId,
        role: "assistant",
                content: contentToSave,
                parts: partsToSave,
                id: lastAssistantMsg.id || generateId(),
              });
            } catch (error: any) {
              console.log("⚠️ [api/chat] Ответ ассистента уже существует или ошибка:", error?.message);
            }
          }
    },
  });
      
      return response;
    } catch (streamError) {
      console.error("🔴 [api/chat] Ошибка в streamText:", streamError);
      throw streamError;
    }
  } catch (error) {
    console.error("🔴 [api/chat] ========== ОШИБКА ==========");
    console.error("🔴 [api/chat] Тип ошибки:", error?.constructor?.name);
    console.error("🔴 [api/chat] Сообщение:", error instanceof Error ? error.message : String(error));
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return errorToUIMessageStream(errorMessage, 500);
  }
}
