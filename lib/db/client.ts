import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const DB_DIR = resolve(process.cwd(), "data");
const DB_PATH = resolve(DB_DIR, "chat.db");

// Создаём директорию, если её нет
mkdirSync(DB_DIR, { recursive: true });

// Ленивая инициализация для предотвращения SQLITE_BUSY при hot-reload
let raw: Database | null = null;
let isMigrated = false;

function getDatabase(): Database {
  // Проверяем, что мы на сервере
  if (typeof window !== "undefined") {
    throw new Error("Database can only be used on the server side");
  }

  if (!raw) {
    raw = new Database(DB_PATH);
    
    // Настройки SQLite
    raw.exec("PRAGMA journal_mode = WAL");
    raw.exec("PRAGMA foreign_keys = ON");
    raw.exec("PRAGMA busy_timeout = 5000");
    
    if (!isMigrated) {
      // Инициализация таблиц
      raw.exec(`
        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      `);
      
      isMigrated = true;
    }
  }
  return raw;
}

export const db = {
  query(sql: string) {
    const db = getDatabase();
    return {
      get: (...params: any[]) => {
        const stmt = db.prepare(sql);
        return stmt.get(...params) as any;
      },
      all: (...params: any[]) => {
        const stmt = db.prepare(sql);
        return stmt.all(...params) as any[];
      },
      run: (...params: any[]) => {
        const stmt = db.prepare(sql);
        stmt.run(...params);
        return { changes: stmt.changes, lastInsertRowid: stmt.lastInsertRowId };
      },
    };
  },
  run(sql: string, params?: any[]) {
    const stmt = getDatabase().prepare(sql);
    stmt.run(...(params || []));
    return { changes: stmt.changes, lastInsertRowid: stmt.lastInsertRowId };
  },
  exec(sql: string) {
    getDatabase().exec(sql);
  },
};
