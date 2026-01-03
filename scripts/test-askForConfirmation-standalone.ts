#!/usr/bin/env bun

/**
 * Независимый тест для askForConfirmation
 * 
 * Этот скрипт проверяет формат сообщений для askForConfirmation
 * без подключения к основным файлам проекта.
 * 
 * Использование:
 *   bun run scripts/test-askForConfirmation-standalone.ts
 * 
 * Требования:
 *   - Переменная окружения OPENAI_API_KEY должна быть установлена
 *   - AI SDK должен быть установлен (ai, @ai-sdk/openai)
 */

import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";
import { z } from "zod";

// Определяем tool для askForConfirmation (как в chat-tools.ts)
const askForConfirmationTool = {
  askForConfirmation: {
    description: "Ask the user for general confirmation on any question. This tool shows a UI card with a question and Yes/No buttons. Use this for any non-dangerous confirmation requests. After receiving the result (yes/no), you MUST respond with text: if 'yes' → 'Ок, подтверждено.', if 'no' → 'Ок, отменено.'",
    parameters: z.object({
      message: z.string().describe("The confirmation question to show to the user (e.g., 'Do you want to proceed?', 'Подтвердите действие')"),
    }),
  },
};

console.log("🧪 Независимый тест askForConfirmation");
console.log("═══════════════════════════════════════\n");

// Проверяем наличие API ключа
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не установлен");
  console.error("   Установите переменную окружения: export OPENAI_API_KEY=your-key");
  process.exit(1);
}

console.log("✅ OPENAI_API_KEY найден");
console.log("");

// Симулируем сообщения для askForConfirmation
// Сценарий: пользователь просит подтверждение, модель вызывает tool, пользователь отвечает "yes"
const testMessages = [
  {
    id: "msg-user-1",
    role: "user" as const,
    content: "Спроси у меня подтверждение действия",
    parts: [
      {
        type: "text" as const,
        text: "Спроси у меня подтверждение действия",
      },
    ],
    createdAt: new Date(),
  },
  {
    id: "msg-assistant-1",
    role: "assistant" as const,
    content: "Подтвердите действие.",
    parts: [
      {
        type: "text" as const,
        text: "Подтвердите действие.",
      },
      {
        type: "tool-call" as const,
        toolCallId: "call_test123",
        toolName: "askForConfirmation",
        args: {
          message: "Подтвердите действие.",
        },
      },
    ],
    createdAt: new Date(),
  },
  {
    id: "msg-assistant-2",
    role: "assistant" as const,
    content: "",
    parts: [
      {
        type: "text" as const,
        text: "Подтвердите действие.",
      },
      {
        type: "tool-call" as const,
        toolCallId: "call_test123",
        toolName: "askForConfirmation",
        args: {
          message: "Подтвердите действие.",
        },
      },
      {
        type: "tool-askForConfirmation" as const,
        toolCallId: "call_test123",
        toolName: "askForConfirmation",
        input: {
          message: "Подтвердите действие.",
        },
        output: "yes", // Tool result от addToolOutput
        result: "yes",
        state: "output-available" as const,
      },
    ],
    createdAt: new Date(),
  },
];

console.log("📋 Тестовые сообщения (UIMessage[]):");
console.log(JSON.stringify(testMessages.map(m => ({
  role: m.role,
  id: m.id,
  content: m.content,
  parts: m.parts?.map((p: any) => ({
    type: p.type,
    toolCallId: p.toolCallId,
    toolName: p.toolName,
    output: p.output,
    result: p.result,
    state: p.state,
  })),
})), null, 2));
console.log("");

// Шаг 1: Преобразуем UIMessage[] в ModelMessage[] с помощью convertToModelMessages
console.log("🔧 Шаг 1: Преобразование UIMessage[] → ModelMessage[]");
console.log("─────────────────────────────────────────────────────");

let modelMessages: any[];
try {
  modelMessages = await convertToModelMessages(testMessages);
  console.log("✅ Преобразование успешно");
  console.log(`📊 Получено ${modelMessages.length} ModelMessage[]`);
  console.log("");
  
  // Детальный анализ каждого сообщения
  modelMessages.forEach((msg, i) => {
    console.log(`  [${i}] role: ${msg.role}`);
    const keys = Object.keys(msg);
    console.log(`      keys: ${keys.join(", ")}`);
    
    if (msg.role === "tool") {
      console.log(`      tool_call_id: ${msg.tool_call_id || msg.toolCallId || "N/A"}`);
      const contentType = Array.isArray(msg.content) ? "array" : typeof msg.content;
      console.log(`      content type: ${contentType}`);
      if (Array.isArray(msg.content)) {
        console.log(`      content length: ${msg.content.length}`);
        if (msg.content.length > 0) {
          console.log(`      content[0]: ${JSON.stringify(msg.content[0]).substring(0, 100)}`);
        }
      } else {
        console.log(`      content: ${String(msg.content).substring(0, 100)}`);
      }
    } else if (msg.role === "assistant") {
      const contentType = Array.isArray(msg.content) ? "array" : typeof msg.content;
      console.log(`      content type: ${contentType}`);
      if (Array.isArray(msg.content)) {
        console.log(`      content length: ${msg.content.length}`);
        msg.content.forEach((part: any, j: number) => {
          console.log(`        [${j}] type: ${part.type}, toolCallId: ${part.toolCallId || "N/A"}`);
        });
      } else {
        console.log(`      content: ${String(msg.content).substring(0, 100)}`);
      }
    } else {
      const contentType = Array.isArray(msg.content) ? "array" : typeof msg.content;
      console.log(`      content type: ${contentType}`);
      if (typeof msg.content === "string") {
        console.log(`      content: ${msg.content.substring(0, 100)}`);
      }
    }
    console.log("");
  });
} catch (error: any) {
  console.error("❌ Ошибка при преобразовании:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}

// Шаг 2: Очищаем ModelMessage[] от полей UIMessage и исправляем tool messages
console.log("🔧 Шаг 2: Очистка ModelMessage[] от полей UIMessage и исправление tool messages");
console.log("─────────────────────────────────────────────────────");

const cleanedMessages = modelMessages.map((msg: any) => {
  // Удаляем только поля UIMessage (id, parts, createdAt), остальные поля оставляем
  const { id, parts, createdAt, ...modelMessage } = msg;
  
  // FIX: Исправляем tool messages от convertToModelMessages
  if (modelMessage.role === "tool") {
    // convertToModelMessages может создать tool message с content как tool-result объект
    // Нужно извлечь tool_call_id и преобразовать content в TextPart[]
    if (Array.isArray(modelMessage.content) && modelMessage.content.length > 0) {
      const firstPart = modelMessage.content[0];
      // Если content содержит tool-result, извлекаем toolCallId и output
      if (firstPart?.type === "tool-result" && firstPart.toolCallId) {
        const toolCallId = firstPart.toolCallId;
        const output = firstPart.output;
        // Преобразуем output в строку для content
        let outputText = "";
        if (typeof output === "string") {
          outputText = output;
        } else if (output && typeof output === "object") {
          // Если output - объект, извлекаем value или преобразуем в JSON
          outputText = output.value || output.text || JSON.stringify(output);
        } else {
          outputText = String(output || "");
        }
        
        return {
          role: "tool",
          tool_call_id: toolCallId,
          content: [{ type: "text" as const, text: outputText }],
        };
      }
    }
    
    // Если tool message без tool_call_id, пытаемся найти его в content
    if (!modelMessage.tool_call_id && !modelMessage.toolCallId) {
      if (Array.isArray(modelMessage.content) && modelMessage.content.length > 0) {
        const toolCallId = modelMessage.content[0]?.toolCallId;
        if (toolCallId) {
          // Извлекаем output из content
          const output = modelMessage.content[0]?.output;
          let outputText = "";
          if (typeof output === "string") {
            outputText = output;
          } else if (output && typeof output === "object") {
            outputText = output.value || output.text || JSON.stringify(output);
          } else {
            outputText = String(output || "");
          }
          
          return {
            role: "tool",
            tool_call_id: toolCallId,
            content: [{ type: "text" as const, text: outputText }],
          };
        }
      }
    }
    
    // Если content пустой или не содержит TextPart, создаём пустой TextPart
    if (!Array.isArray(modelMessage.content) || modelMessage.content.length === 0) {
      return {
        role: "tool",
        tool_call_id: modelMessage.tool_call_id || modelMessage.toolCallId || "",
        content: [{ type: "text" as const, text: "" }],
      };
    }
    
    // Если content не содержит TextPart, преобразуем
    const hasTextPart = modelMessage.content.some((p: any) => p?.type === "text");
    if (!hasTextPart) {
      const textValue = modelMessage.content[0]?.text || 
                       modelMessage.content[0]?.value || 
                       JSON.stringify(modelMessage.content);
      return {
        role: "tool",
        tool_call_id: modelMessage.tool_call_id || modelMessage.toolCallId || "",
        content: [{ type: "text" as const, text: String(textValue) }],
      };
    }
  }
  
  return modelMessage;
});

console.log("✅ Очистка и исправление завершены");
console.log("");

// Шаг 3: Финальная очистка - оставляем только разрешённые поля и удаляем невалидные tool messages
console.log("🔧 Шаг 3: Финальная очистка - только разрешённые поля");
console.log("─────────────────────────────────────────────────────");

const finalMessages = cleanedMessages
  .map((msg: any) => {
    const allowedFields = msg.role === 'tool' 
      ? ['role', 'content', 'tool_call_id']
      : ['role', 'content'];
    
    const cleaned: any = {};
    allowedFields.forEach(field => {
      if (msg[field] !== undefined) {
        cleaned[field] = msg[field];
      }
    });
    
    // FIX: Для user messages content должен быть строкой, а не массивом
    if (msg.role === 'user' && Array.isArray(cleaned.content)) {
      // Извлекаем текст из массива TextPart
      const textParts = cleaned.content.filter((p: any) => p?.type === 'text');
      cleaned.content = textParts.map((p: any) => p.text).join('');
    }
    
    return cleaned;
  })
  // FIX: Удаляем tool messages без tool_call_id (они невалидны)
  .filter((msg: any) => {
    if (msg.role === 'tool') {
      const toolCallId = msg.tool_call_id || msg.toolCallId;
      if (!toolCallId || toolCallId.trim() === '') {
        console.warn(`⚠️ Удаляем tool message без tool_call_id:`, msg);
        return false;
      }
    }
    return true;
  });

console.log("✅ Финальная очистка завершена");
console.log(`📊 Финальных сообщений: ${finalMessages.length}`);
console.log("");

// Детальный анализ финальных сообщений
finalMessages.forEach((msg, i) => {
  console.log(`  [${i}] role: ${msg.role}`);
  const keys = Object.keys(msg);
  console.log(`      keys: ${keys.join(", ")}`);
  
  if (msg.role === "tool") {
    console.log(`      tool_call_id: ${msg.tool_call_id || "N/A"}`);
    const contentType = Array.isArray(msg.content) ? "array" : typeof msg.content;
    console.log(`      content type: ${contentType}`);
    if (Array.isArray(msg.content)) {
      console.log(`      content: ${JSON.stringify(msg.content).substring(0, 150)}`);
    } else {
      console.log(`      content: ${String(msg.content).substring(0, 100)}`);
    }
  } else {
    const contentType = Array.isArray(msg.content) ? "array" : typeof msg.content;
    console.log(`      content type: ${contentType}`);
    if (Array.isArray(msg.content)) {
      console.log(`      content length: ${msg.content.length}`);
      if (msg.content.length > 0) {
        console.log(`      content[0]: ${JSON.stringify(msg.content[0]).substring(0, 100)}`);
      }
    } else {
      console.log(`      content: ${String(msg.content).substring(0, 100)}`);
    }
  }
  console.log("");
});

// Шаг 4: Валидация формата
console.log("🔧 Шаг 4: Валидация формата ModelMessage[]");
console.log("─────────────────────────────────────────────────────");

const validationErrors: string[] = [];

finalMessages.forEach((msg: any, i: number) => {
  if (!msg.role) {
    validationErrors.push(`Message ${i}: отсутствует role`);
  }
  
  if (msg.role === 'tool') {
    if (!msg.tool_call_id) {
      validationErrors.push(`Message ${i}: tool message без tool_call_id`);
    }
    if (!msg.content) {
      validationErrors.push(`Message ${i}: tool message без content`);
    }
    if (!Array.isArray(msg.content)) {
      validationErrors.push(`Message ${i}: tool message content не массив (${typeof msg.content})`);
    } else {
      const hasTextPart = msg.content.some((p: any) => p?.type === "text");
      if (!hasTextPart) {
        validationErrors.push(`Message ${i}: tool message content не содержит TextPart`);
      }
    }
  }
  
  if (msg.role === 'assistant' && !msg.content) {
    validationErrors.push(`Message ${i}: assistant message без content`);
  }
  
  // Проверка на недопустимые поля
  const allowedFields = msg.role === 'tool' 
    ? ['role', 'content', 'tool_call_id']
    : ['role', 'content'];
  const invalidFields = Object.keys(msg).filter(k => !allowedFields.includes(k));
  if (invalidFields.length > 0) {
    validationErrors.push(`Message ${i}: содержит недопустимые поля: ${invalidFields.join(', ')}`);
  }
});

if (validationErrors.length > 0) {
  console.error("❌ Ошибки валидации:");
  validationErrors.forEach((error, i) => {
    console.error(`  ${i + 1}. ${error}`);
  });
  console.error("");
  console.error("❌ Полный формат finalMessages:");
  console.error(JSON.stringify(finalMessages, null, 2));
  process.exit(1);
}

console.log("✅ Валидация пройдена успешно");
console.log("");

// Шаг 5: Тест вызова streamText
console.log("🔧 Шаг 5: Тест вызова streamText с OpenAI");
console.log("─────────────────────────────────────────────────────");

const systemPrompt = `Ты помощник. Когда пользователь отвечает на подтверждение, отвечай коротко:
- Если ответ "yes" → "Ок, подтверждено."
- Если ответ "no" → "Ок, отменено."`;

try {
  console.log("📤 Отправка запроса в OpenAI...");
  console.log(`📊 Сообщений: ${finalMessages.length}`);
  console.log(`🔧 Tools: askForConfirmation`);
  console.log("");
  
  const result = await streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: finalMessages,
    tools: {
      askForConfirmation: {
        description: askForConfirmationTool.askForConfirmation.description,
        parameters: askForConfirmationTool.askForConfirmation.parameters,
        execute: async ({ message }: { message: string }) => {
          // В реальном приложении это client-side tool, но для теста просто возвращаем
          return "yes";
        },
      },
    },
  });
  
  console.log("✅ streamText вызван успешно");
  console.log("");
  
  // Читаем поток
  console.log("📥 Чтение потока ответа...");
  console.log("");
  
  let text = "";
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
    text += chunk;
  }
  
  console.log("");
  console.log("");
  console.log("═══════════════════════════════════════");
  console.log("✅ ТЕСТ ЗАВЕРШЁН УСПЕШНО!");
  console.log("═══════════════════════════════════════");
  console.log(`📝 Полный ответ: "${text}"`);
  console.log("");
  
} catch (error: any) {
  console.error("❌ Ошибка при вызове streamText:");
  console.error(`   ${error.message}`);
  if (error.stack) {
    console.error("");
    console.error("   Stack trace:");
    console.error(error.stack);
  }
  console.error("");
  console.error("❌ Формат сообщений, который вызвал ошибку:");
  console.error(JSON.stringify(finalMessages, null, 2));
  process.exit(1);
}

