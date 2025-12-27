import { notFound } from "next/navigation";
import { getThread, getMessages } from "@/lib/db/chat-store";
import ChatClient from "./ChatClient";
import type { UIMessage } from "ai";

function loadThread(id: string) {
  const row = getThread(id);
  return row;
}

function loadMessages(threadId: string) {
  return getMessages(threadId);
}

// Преобразуем сообщения из БД в формат UIMessage
function convertToUIMessages(
  dbMessages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: number;
  }>
): UIMessage[] {
  return dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content, // Добавляем content для совместимости с типом
    parts: [
      {
        type: "text",
        text: msg.content,
      },
    ],
    createdAt: new Date(msg.created_at),
  })) as UIMessage[];
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const thread = loadThread(id);
  if (!thread) notFound();

  const dbMessages = loadMessages(id);
  const initialMessages = convertToUIMessages(dbMessages);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          background: "#151515",
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0, fontWeight: 600 }}>
          {thread.title}
        </h1>
      </div>

      {/* Чат */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatClient threadId={id} initialMessages={initialMessages} />
      </div>
    </div>
  );
}

