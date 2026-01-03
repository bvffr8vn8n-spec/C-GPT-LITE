#!/usr/bin/env bun

/**
 * Скрипт для тестирования askForConfirmation в консоли
 * 
 * Использование:
 *   bun run scripts/test-askForConfirmation.ts
 * 
 * Этот скрипт проверяет формат сообщений для askForConfirmation:
 * 1. Симулирует сообщения с tool result
 * 2. Проверяет формат tool messages (content должен быть строкой)
 * 3. Проверяет отсутствие дубликатов assistant сообщений
 */

const API_URL = process.env.API_URL || "http://localhost:3000/api/chat";
const threadId = `test-confirmation-${Date.now()}`;

console.log("🧪 Тестирование askForConfirmation");
console.log("📝 Thread ID:", threadId);
console.log("🌐 API URL:", API_URL);
console.log("");

// Симулируем сообщения для askForConfirmation
// Тест: Запрос с tool result (после клика "Да")
const testMessages = [
  {
    id: `msg-user-${Date.now()}`,
    role: "user",
    content: "Спроси у меня подтверждение действия",
    parts: [
      {
        type: "text",
        text: "Спроси у меня подтверждение действия",
      },
    ],
    createdAt: new Date(),
  },
  {
    id: `msg-assistant-${Date.now()}`,
    role: "assistant",
    content: "",
    parts: [
      {
        type: "text",
        text: "Подтвердите действие.",
      },
      {
        type: "tool-call",
        toolCallId: "call_test123",
        toolName: "askForConfirmation",
        args: {
          message: "Подтвердите действие.",
        },
      },
      {
        type: "tool-askForConfirmation",
        toolCallId: "call_test123",
        toolName: "askForConfirmation",
        input: {
          message: "Подтвердите действие.",
        },
        output: "yes", // Tool result от addToolOutput
        result: "yes",
        state: "output-available",
      },
    ],
    createdAt: new Date(),
  },
];

console.log("📋 Тестовые сообщения:");
console.log(JSON.stringify(testMessages.map(m => ({
  role: m.role,
  parts: m.parts?.map((p: any) => ({
    type: p.type,
    toolCallId: p.toolCallId,
    toolName: p.toolName,
    output: p.output,
    result: p.result,
  })),
})), null, 2));
console.log("");

// Проверка формата перед отправкой
function validateBeforeSend(messages: any[]) {
  console.log("🔍 Проверка формата сообщений перед отправкой:");
  
  const errors: string[] = [];
  const assistantMessages = messages.filter((m: any) => m.role === "assistant");
  
  // Проверяем tool results в assistant messages
  assistantMessages.forEach((msg: any, i: number) => {
    const toolParts = msg.parts?.filter((p: any) => p.type?.startsWith("tool-")) || [];
    toolParts.forEach((part: any) => {
      if (part.output !== undefined || part.result !== undefined) {
        const result = part.output || part.result;
        console.log(`  ✅ Tool result найден в assistant message ${i}:`, {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          resultType: typeof result,
          resultValue: result,
        });
        
        if (typeof result !== "string" && typeof result !== "object") {
          errors.push(`Tool result должен быть строкой или объектом, получен ${typeof result}`);
        }
      }
    });
  });
  
  if (errors.length > 0) {
    console.log(`\n❌ Найдено ошибок: ${errors.length}`);
    errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
    return false;
  } else {
    console.log(`\n✅ Формат сообщений корректен!`);
    return true;
  }
}

// Отправка запроса и проверка ответа
async function testRequest() {
  console.log("═══════════════════════════════════════");
  console.log("ОТПРАВКА ЗАПРОСА НА СЕРВЕР");
  console.log("═══════════════════════════════════════");
  
  if (!validateBeforeSend(testMessages)) {
    console.error("❌ Валидация не пройдена, прерываем тест");
    return;
  }
  
  try {
    console.log("📤 Отправляем запрос на сервер...");
    console.log("📦 Тело запроса (упрощённое):");
    console.log(JSON.stringify({
      threadId,
      messagesCount: testMessages.length,
      hasToolResult: testMessages.some((m: any) => 
        m.parts?.some((p: any) => p.output || p.result)
      ),
    }, null, 2));
    console.log("");
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId,
        messages: testMessages,
      }),
    });

    console.log("📥 Статус ответа:", response.status);
    console.log("📋 Заголовки:", Object.fromEntries(response.headers.entries()));
    console.log("");

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Ошибка сервера:", errorText);
      return;
    }

    if (!response.body) {
      console.error("❌ Нет тела ответа");
      return;
    }

    console.log("✅ Ответ получен, читаем поток...");
    console.log("");

    // Читаем SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;
    let hasError = false;
    let lastText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        
        try {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            console.log("🏁 [DONE]");
            continue;
          }

          const data = JSON.parse(jsonStr);
          chunkCount++;

          if (data.type === "error") {
            console.error("❌ Ошибка в потоке:", data.error || JSON.stringify(data));
            hasError = true;
          } else if (data.error) {
            console.error("❌ Ошибка в данных:", data.error);
            hasError = true;
          } else if (data.type === "text-delta" || data.type === "text") {
            const text = data.text || "";
            process.stdout.write(text);
            lastText += text;
          } else if (data.type === "tool-call") {
            console.log("\n🔧 Tool call:", data);
          } else if (data.type === "tool-result") {
            console.log("\n✅ Tool result:", data);
          } else if (data.type === "finish") {
            console.log("\n🏁 Finish:", data);
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    }

    console.log("\n");
    console.log("═══════════════════════════════════════");
    console.log("РЕЗУЛЬТАТЫ ТЕСТА");
    console.log("═══════════════════════════════════════");
    console.log(`📊 Всего chunks: ${chunkCount}`);
    console.log(`📝 Текст ответа: "${lastText.substring(0, 200)}${lastText.length > 200 ? '...' : ''}"`);
    console.log(`📏 Длина текста: ${lastText.length} символов`);
    
    if (hasError) {
      console.log("❌ Обнаружена ошибка в потоке");
      console.log("💡 Проверьте логи сервера для деталей");
    } else if (chunkCount === 0) {
      console.log("⚠️ Не получено ни одного chunk - возможно, сервер не запущен");
      console.log("💡 Убедитесь, что сервер запущен: bun run dev");
    } else if (lastText.length === 0) {
      console.log("⚠️ Получены chunks, но текст пустой");
      console.log("💡 Возможно, модель не ответила или произошла ошибка");
    } else {
      console.log("✅ Тест завершён успешно!");
      console.log("✅ Модель получила tool result и ответила текстом");
    }
    
  } catch (error: any) {
    console.error("\n❌ Критическая ошибка:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

// Запуск
testRequest();

