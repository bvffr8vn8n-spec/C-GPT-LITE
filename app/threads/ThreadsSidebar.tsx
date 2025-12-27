import { db } from "@/lib/db/client";
import NewThreadForm from "./NewThreadForm";
import ThreadItem from "./ThreadItem";

type ThreadRow = {
  id: string;
  title: string;
  created_at: number;
};

function getThreads(): ThreadRow[] {
  return db
    .query(
      `SELECT id, title, created_at FROM threads ORDER BY created_at DESC`
    )
    .all() as ThreadRow[];
}

export default async function ThreadsSidebar() {
  const threads = getThreads();

  return (
    <aside
      style={{
        width: 260,
        borderRight: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        flexDirection: "column",
        background: "#151515",
      }}
    >
      {/* Заголовок и кнопка создания */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              margin: 0,
              marginBottom: 8,
            }}
          >
            Чаты
          </h2>
        </div>
        <NewThreadForm />
      </div>

      {/* Список тредов */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
        }}
      >
        {threads.length === 0 ? (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              opacity: 0.6,
              fontSize: 13,
            }}
          >
            Нет чатов
            <br />
            Создайте новый выше
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {threads.map((t) => (
              <ThreadItem
                key={t.id}
                threadId={t.id}
                title={t.title}
                createdAt={t.created_at}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

