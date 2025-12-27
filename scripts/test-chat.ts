#!/usr/bin/env bun

/**
 * Скрипт для тестирования API /api/chat напрямую из терминала
 * 
 * Использование:
 *   bun run scripts/test-chat.ts "Привет, как дела?"
 *   bun run scripts/test-chat.ts "Покажи таблицу" --thread-id test-123
 */

const message = process.argv[2] || "Привет!";
const threadId = process.argv.includes("--thread-id") 
  ? process.argv[process.argv.indexOf("--thread-id") + 1] 
  : `test-${Date.now()}`;

const API_URL = process.env.API_URL || "http://localhost:3000/api/chat";

console.log("🚀 Тестирование API /api/chat");
console.log("📝 Сообщение:", message);
console.log("🧵 Thread ID:", threadId);
console.log("🔗 URL:", API_URL);
console.log("");

const requestBody = {
  id: threadId,
  threadId: threadId,
  messages: [
    {
      id: `msg-${Date.now()}`,
      role: "user",
      content: message,
    },
  ],
};

console.log("📤 Отправка запроса...");
console.log("📦 Тело запроса:", JSON.stringify(requestBody, null, 2));
console.log("");

try {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("📥 Статус ответа:", response.status);
  console.log("📋 Заголовки:", Object.fromEntries(response.headers.entries()));
  console.log("");

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Ошибка:", errorText);
    process.exit(1);
  }

  if (!response.body) {
    console.error("❌ Нет тела ответа");
    process.exit(1);
  }

  console.log("✅ Ответ получен, чтение потока...");
  console.log("");

  // Next.js автоматически распаковывает gzip на уровне сервера
  // Поэтому читаем поток напрямую без распаковки
  const contentEncoding = response.headers.get("content-encoding");
  if (contentEncoding === "gzip") {
    console.log("📦 Заголовок указывает на gzip, но Next.js уже распаковал");
  }
  
  // Читаем поток напрямую
  const streamToRead = response.body;

  // Читаем поток
  const reader = streamToRead.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      console.log("");
      console.log("✅ Поток завершен. Всего chunks:", chunkCount);
      break;
    }

    if (value) {
      console.log(`📥 Получено ${value.length} байт данных`);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      // Логируем первые несколько строк для отладки
      if (chunkCount === 0 && lines.length > 0) {
        console.log("📄 Первые строки из потока:");
        lines.slice(0, 5).forEach((line, idx) => {
          console.log(`   ${idx + 1}: ${line.substring(0, 150)}`);
        });
      }

      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Логируем не-SSE строки для отладки
        if (!line.startsWith("data: ")) {
          if (line.trim() && !line.startsWith(":") && !line.startsWith("event:")) {
            console.log("📄 Не-SSE строка:", line.substring(0, 100));
          }
          continue;
        }

        try {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            console.log("🏁 [DONE]");
            continue;
          }

          const data = JSON.parse(jsonStr);
          chunkCount++;

          // Выводим информацию о chunk
          if (data.type) {
            console.log(`📦 Chunk ${chunkCount} [${data.type}]:`, 
              data.text ? data.text.substring(0, 100) + "..." : 
              data.toolCalls ? `Tool calls: ${data.toolCalls.length}` :
              Object.keys(data).join(", ")
            );
          } else {
            console.log(`📦 Chunk ${chunkCount}:`, Object.keys(data).join(", "));
          }
        } catch (e) {
          console.warn("⚠️ Ошибка парсинга:", line.substring(0, 100));
        }
      }
    }
  }

  // Обрабатываем оставшиеся данные в буфере
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (!line.trim() || !line.startsWith("data: ")) continue;
      try {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        const data = JSON.parse(jsonStr);
        console.log("📦 Последний chunk:", Object.keys(data).join(", "));
      } catch (e) {
        // Игнорируем
      }
    }
  }

  console.log("");
  console.log("✅ Тест завершен успешно!");
} catch (error) {
  console.error("❌ Ошибка:", error);
  if (error instanceof Error) {
    console.error("   Сообщение:", error.message);
    console.error("   Стек:", error.stack);
  }
  process.exit(1);
}

