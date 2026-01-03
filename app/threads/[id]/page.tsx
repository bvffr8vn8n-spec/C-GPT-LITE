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
    parts_json: string | null;
    created_at: number;
  }>
): UIMessage[] {
  return dbMessages.map((msg) => {
    // FIX: Восстанавливаем parts из parts_json если есть
    let parts: any[] = [];
    if (msg.parts_json) {
      try {
        parts = JSON.parse(msg.parts_json);
        console.log("✅ [page] Восстановлены parts из БД:", { id: msg.id, partsCount: parts.length });
      } catch (e) {
        console.warn("⚠️ [page] Ошибка парсинга parts_json:", e);
        // Fallback на text part
        parts = [{ type: "text", text: msg.content }];
      }
    } else {
      // Fallback: если нет parts_json, создаём text part
      parts = [{ type: "text", text: msg.content }];
    }
    
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parts,
      createdAt: new Date(msg.created_at),
    } as UIMessage;
  });
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
        <ChatClient key={id} threadId={id} initialMessages={initialMessages} />
      </div>
    </div>
  );
}

