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
}): string {
  const id = opts.id ?? generateId();
  db.run(
    `INSERT INTO messages (id, thread_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, opts.threadId, opts.role, opts.content, opts.createdAt ?? Date.now()]
  );
  return id;
}

export function getMessages(threadId: string): Array<{
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
}> {
  return db
    .query(
      `SELECT id, role, content, created_at
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

