#!/usr/bin/env bun

/**
 * Скрипт для проверки формата сообщений, который отправляет useChat
 */

const API_URL = "http://localhost:3000/api/chat";

// Симулируем формат, который отправляет useChat
const useChatFormat = {
  id: "test-thread-123",
  threadId: "test-thread-123",
  messages: [
    {
      id: "msg-1",
      role: "user",
      content: "Привет",
      parts: [
        {
          type: "text",
          text: "Привет",
        },
      ],
      createdAt: new Date(),
    },
  ],
};

// Симулируем формат CoreMessage (что ожидает streamText)
const coreMessageFormat = [
  {
    role: "user",
    content: "Привет",
  },
];

console.log("📋 Формат от useChat:");
console.log(JSON.stringify(useChatFormat, null, 2));
console.log("\n📋 Формат для streamText (CoreMessage):");
console.log(JSON.stringify(coreMessageFormat, null, 2));
console.log("\n");

// Тестируем преобразование
function convertToCoreMessages(uiMessages: any[]) {
  return uiMessages
    .filter((msg) => msg && (msg.content || msg.parts || msg.text))
    .map((msg) => {
      let role = msg.role || "user";
      let content = "";
      
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (msg.parts && Array.isArray(msg.parts)) {
        content = msg.parts
          .filter((p: any) => p.type === "text" && p.text)
          .map((p: any) => p.text)
          .join("");
      } else if (msg.text) {
        content = msg.text;
      }
      
      if (content && (role === "user" || role === "assistant" || role === "system")) {
        return {
          role: role as "user" | "assistant" | "system",
          content: content,
        };
      }
      return null;
    })
    .filter((msg) => msg !== null);
}

const converted = convertToCoreMessages(useChatFormat.messages);
console.log("✅ Преобразование:");
console.log(JSON.stringify(converted, null, 2));

