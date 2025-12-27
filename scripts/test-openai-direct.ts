#!/usr/bin/env bun

/**
 * Скрипт для прямого обращения к OpenAI API через API ключ
 * 
 * Использование:
 *   bun run scripts/test-openai-direct.ts "Привет, как дела?"
 *   $env:OPENAI_API_KEY='your_key'; bun run scripts/test-openai-direct.ts "Вопрос"
 */

import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const message = process.argv[2] || "Привет! Как дела?";

// Получаем API ключ из переменных окружения или .env.local
let apiKey = process.env.OPENAI_API_KEY;

// Проверяем, что ключ валидный (не пример)
const isInvalidKey = !apiKey || 
  apiKey === "your_openai_api_key_here" || 
  apiKey === "your_actual_api_key_here" ||
  apiKey.startsWith("your_");

// Если ключ не найден или невалидный, пытаемся прочитать из .env.local
if (isInvalidKey) {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/OPENAI_API_KEY\s*=\s*(.+)/);
    if (match && match[1]) {
      const fileKey = match[1].trim().replace(/^["']|["']$/g, "");
      // Проверяем, что ключ из файла валидный
      if (fileKey && !fileKey.startsWith("your_") && fileKey !== "your_openai_api_key_here") {
        apiKey = fileKey;
        console.log("📂 API ключ загружен из .env.local");
      }
    }
  } catch (e) {
    // Игнорируем ошибки чтения файла
  }
}

// Финальная проверка
const isStillInvalid = !apiKey || 
  apiKey === "your_openai_api_key_here" || 
  apiKey === "your_actual_api_key_here" ||
  apiKey.startsWith("your_");

if (isStillInvalid) {
  console.error("❌ Ошибка: OPENAI_API_KEY не настроен");
  console.error("   Установите переменную окружения:");
  console.error("   $env:OPENAI_API_KEY='your_key'  # PowerShell");
  console.error("   export OPENAI_API_KEY='your_key'  # Bash");
  process.exit(1);
}

console.log("🚀 Прямое обращение к OpenAI API");
console.log("📝 Сообщение:", message);
console.log("🔑 API Key:", apiKey.substring(0, 10) + "...");
console.log("");

const openai = new OpenAI({
  apiKey: apiKey,
});

async function main() {
  try {
    console.log("📤 Отправка запроса в OpenAI...");
    console.log("");

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
      stream: true,
    });

    console.log("✅ Ответ получен, чтение потока...");
    console.log("");

    let chunkCount = 0;
    let fullText = "";

    for await (const chunk of stream) {
      chunkCount++;
      const content = chunk.choices[0]?.delta?.content || "";
      
      if (content) {
        fullText += content;
        process.stdout.write(content);
      }

      // Показываем информацию о chunk каждые 10 chunks
      if (chunkCount % 10 === 0) {
        console.log(`\n[Chunk ${chunkCount}]`);
      }
    }

    console.log("");
    console.log("");
    console.log("✅ Поток завершен");
    console.log(`📊 Статистика:`);
    console.log(`   - Всего chunks: ${chunkCount}`);
    console.log(`   - Длина ответа: ${fullText.length} символов`);
    console.log(`   - Первые 100 символов: ${fullText.substring(0, 100)}...`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    if (error instanceof OpenAI.APIError) {
      console.error("   Код:", error.status);
      console.error("   Сообщение:", error.message);
      if (error.code) {
        console.error("   Тип ошибки:", error.code);
      }
    } else if (error instanceof Error) {
      console.error("   Сообщение:", error.message);
      console.error("   Стек:", error.stack);
    }
    process.exit(1);
  }
}

main();

