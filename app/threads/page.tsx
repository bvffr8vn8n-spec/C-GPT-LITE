import NewThreadForm from "./NewThreadForm";

// Приветственная страница когда чат не выбран
export default function ThreadsPage() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: "#0a0a0a",
        color: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 600,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            marginBottom: 16,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          ChatGPT-lite
        </h1>
        <p
          style={{
            fontSize: 18,
            opacity: 0.8,
            marginBottom: 32,
            lineHeight: 1.6,
          }}
        >
          Выберите чат из списка слева или создайте новый
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: "24px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              width: "100%",
              maxWidth: 400,
            }}
          >
            <NewThreadForm />
          </div>

          <div
            style={{
              marginTop: 24,
              padding: "20px",
              borderRadius: 12,
              background: "rgba(102, 126, 234, 0.1)",
              border: "1px solid rgba(102, 126, 234, 0.2)",
              fontSize: 14,
              opacity: 0.9,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              💡 Возможности:
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 20,
                textAlign: "left",
                opacity: 0.8,
              }}
            >
              <li>Чат с историей сообщений</li>
              <li>Работа с Excel таблицами</li>
              <li>Генеративный UI с tools</li>
              <li>Подтверждение опасных действий</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

