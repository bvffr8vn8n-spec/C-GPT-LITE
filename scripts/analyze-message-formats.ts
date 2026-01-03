#!/usr/bin/env bun

/**
 * Скрипт для анализа форматов сообщений:
 * 1. Что отправляет useChat (обычное сообщение пользователя)
 * 2. Что отправляет addToolOutput (tool result)
 * 3. Что возвращает сервер (toUIMessageStreamResponse)
 */

console.log("🔍 АНАЛИЗ ФОРМАТОВ СООБЩЕНИЙ");
console.log("═══════════════════════════════════════\n");

// 1. ФОРМАТ: Обычное сообщение пользователя (useChat отправляет)
console.log("1️⃣ ФОРМАТ: Обычное сообщение пользователя (useChat → сервер)");
const userMessageFormat = {
  id: "msg-user-123",
  role: "user",
  content: "Привет",
  parts: [
    {
      type: "text",
      text: "Привет",
    },
  ],
  createdAt: new Date(),
};
console.log(JSON.stringify(userMessageFormat, null, 2));
console.log("");

// 2. ФОРМАТ: Assistant сообщение с tool-call (сервер → клиент)
console.log("2️⃣ ФОРМАТ: Assistant сообщение с tool-call (сервер → клиент)");
const assistantMessageWithToolCall = {
  id: "msg-assistant-456",
  role: "assistant",
  content: "",
  parts: [
    {
      type: "text",
      text: "Подтвердите действие.",
    },
    {
      type: "tool-call",
      toolCallId: "call_abc123",
      toolName: "askForConfirmation",
      args: {
        message: "Подтвердите действие.",
      },
    },
  ],
  createdAt: new Date(),
};
console.log(JSON.stringify(assistantMessageWithToolCall, null, 2));
console.log("");

// 3. ФОРМАТ: Assistant сообщение с tool-result (addToolOutput → сервер)
console.log("3️⃣ ФОРМАТ: Assistant сообщение с tool-result (addToolOutput → сервер)");
const assistantMessageWithToolResult = {
  id: "msg-assistant-456",
  role: "assistant",
  content: "",
  parts: [
    {
      type: "text",
      text: "Подтвердите действие.",
    },
    {
      type: "tool-call",
      toolCallId: "call_abc123",
      toolName: "askForConfirmation",
      args: {
        message: "Подтвердите действие.",
      },
    },
    {
      type: "tool-askForConfirmation",
      toolCallId: "call_abc123",
      toolName: "askForConfirmation",
      input: {
        message: "Подтвердите действие.",
      },
      output: "yes", // ← addToolOutput добавляет это
      result: "yes", // ← может быть и это
      state: "output-available", // ← AI SDK устанавливает это
    },
  ],
  createdAt: new Date(),
};
console.log(JSON.stringify(assistantMessageWithToolResult, null, 2));
console.log("");

// 4. ФОРМАТ: Что ожидает convertToModelMessages
console.log("4️⃣ ФОРМАТ: Что ожидает convertToModelMessages (UIMessage[])");
console.log("  - role: 'user' | 'assistant' | 'tool'");
console.log("  - content: string | TextPart[]");
console.log("  - parts: Part[] (для assistant/user)");
console.log("  - parts может содержать:");
console.log("    * type: 'text' → { type: 'text', text: string }");
console.log("    * type: 'tool-call' → { type: 'tool-call', toolCallId, toolName, args }");
console.log("    * type: 'tool-<toolName>' → { type: 'tool-<toolName>', toolCallId, input, output, result, state }");
console.log("");

// 5. ФОРМАТ: Что создает convertToModelMessages (ModelMessage[])
console.log("5️⃣ ФОРМАТ: Что создает convertToModelMessages (ModelMessage[])");
console.log("  - role: 'user' → { role: 'user', content: string | TextPart[] }");
console.log("  - role: 'assistant' → { role: 'assistant', content: TextPart[] }");
console.log("    * TextPart может быть: { type: 'text', text: string }");
console.log("    * TextPart может быть: { type: 'tool-call', toolCallId, toolName, args }");
console.log("  - role: 'tool' → { role: 'tool', content: string | TextPart[], tool_call_id: string }");
console.log("    ⚠️ ВАЖНО: content для tool может быть строкой или массивом TextPart");
console.log("");

// 6. ФОРМАТ: Что ожидает streamText (ModelMessage[])
console.log("6️⃣ ФОРМАТ: Что ожидает streamText (ModelMessage[])");
console.log("  - role: 'user' → { role: 'user', content: string | TextPart[] }");
console.log("  - role: 'assistant' → { role: 'assistant', content: TextPart[] }");
console.log("  - role: 'tool' → { role: 'tool', content: string | TextPart[], tool_call_id: string }");
console.log("    ⚠️ ВАЖНО: AI SDK 6.0.1 валидирует и требует content как массив TextPart для tool messages");
console.log("");

// 7. ФОРМАТ: Что возвращает toUIMessageStreamResponse (UIMessage[])
console.log("7️⃣ ФОРМАТ: Что возвращает toUIMessageStreamResponse (UIMessage[])");
console.log("  - role: 'user' → { role: 'user', content: string, parts: [{ type: 'text', text: string }] }");
console.log("  - role: 'assistant' → { role: 'assistant', content: string, parts: Part[] }");
console.log("    * parts может содержать: text, tool-call, tool-result, tool-<toolName>");
console.log("");

console.log("═══════════════════════════════════════");
console.log("🔍 ВОЗМОЖНЫЕ ПРОБЛЕМЫ:");
console.log("═══════════════════════════════════════");
console.log("1. Assistant сообщение только с tool-result (без текста) может быть неправильно обработано convertToModelMessages");
console.log("2. Tool message content должен быть массивом TextPart для AI SDK валидации, но может быть строкой от convertToModelMessages");
console.log("3. Дублирование tool messages (от convertToModelMessages и от toolResults)");
console.log("");

