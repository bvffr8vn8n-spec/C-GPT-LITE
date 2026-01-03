import { db } from "./client";

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createThread(title: string, id?: string): string {
  const threadId = id ?? generateId();
  db.run(
    `INSERT INTO threads (id, title, created_at) VALUES (?, ?, ?)`,
    [threadId, title, Date.now()]
  );
  return threadId;
}

export function getThread(id: string): { id: string; title: string; created_at: number } | null {
  return db.query(`SELECT id, title, created_at FROM threads WHERE id = ?`).get(id) as any;
}

export function getAllThreads(): Array<{ id: string; title: string; created_at: number }> {
  return db.query(`SELECT id, title, created_at FROM threads ORDER BY created_at DESC`).all() as any[];
}

export function appendDbMessage(opts: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
  id?: string;
  createdAt?: number;
  parts?: any[]; // FIX: Добавляем parts для сохранения tool-call/tool-result
}): string {
  const id = opts.id ?? generateId();
  
  try {
    // Проверяем, не существует ли уже сообщение с таким ID
    const existing = db.query(`SELECT id FROM messages WHERE id = ?`).get(id) as any;
    if (existing) {
      console.log("⚠️ [chat-store] Сообщение с ID уже существует, пропускаем:", id);
      return id;
    }
    
    // FIX: Сохраняем parts_json если есть
    const partsJson = opts.parts ? JSON.stringify(opts.parts) : null;
    
    db.run(
      `INSERT INTO messages (id, thread_id, role, content, parts_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, opts.threadId, opts.role, opts.content, partsJson, opts.createdAt ?? Date.now()]
    );
    console.log("✅ [chat-store] Сообщение сохранено:", { 
      id, 
      role: opts.role, 
      contentLength: opts.content.length,
      hasParts: !!opts.parts,
      partsCount: opts.parts?.length || 0,
    });
    return id;
  } catch (error: any) {
    // Если ошибка UNIQUE constraint - сообщение уже существует, это нормально
    if (error?.message?.includes("UNIQUE constraint") || error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      console.log("⚠️ [chat-store] Сообщение уже существует (UNIQUE constraint):", id);
      return id;
    }
    // Другие ошибки пробрасываем дальше
    console.error("❌ [chat-store] Ошибка при сохранении сообщения:", error);
    throw error;
  }
}

export function getMessages(threadId: string): Array<{
  id: string;
  role: "user" | "assistant";
  content: string;
  parts_json: string | null;
  created_at: number;
}> {
  return db
    .query(
      `SELECT id, role, content, parts_json, created_at
       FROM messages
       WHERE thread_id = ?
       ORDER BY created_at ASC`
    )
    .all(threadId) as any[];
}

export function deleteThread(threadId: string): void {
  // Сначала удаляем все сообщения
  db.run(`DELETE FROM messages WHERE thread_id = ?`, [threadId]);
  // Затем удаляем тред
  db.run(`DELETE FROM threads WHERE id = ?`, [threadId]);
}

export function deleteMessage(messageId: string): void {
  db.run(`DELETE FROM messages WHERE id = ?`, [messageId]);
}

export function updateMessage(messageId: string, newContent: string): void {
  db.run(`UPDATE messages SET content = ? WHERE id = ?`, [newContent, messageId]);
}

