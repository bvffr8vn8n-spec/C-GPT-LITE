"use client";

interface DangerousActionConfirmationCardProps {
  question: string;
  toolCallId: string;
  onConfirm: (decision: "yes" | "no") => void;
}

export default function DangerousActionConfirmationCard({
  question,
  toolCallId,
  onConfirm,
}: DangerousActionConfirmationCardProps) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: "16px",
        borderRadius: 12,
        border: "1px solid rgba(255,150,100,0.4)",
        background: "rgba(255,150,100,0.15)",
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5, fontWeight: 500 }}>
        ⚠️ {question}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("🟢 [DangerousActionConfirmationCard] Кнопка 'Да' нажата, toolCallId:", toolCallId);
            onConfirm("yes");
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(100,200,100,0.5)",
            background: "rgba(100,200,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(100,200,100,0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(100,200,100,0.2)";
          }}
        >
          Да
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("🔴 [DangerousActionConfirmationCard] Кнопка 'Нет' нажата, toolCallId:", toolCallId);
            onConfirm("no");
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(200,100,100,0.5)",
            background: "rgba(200,100,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(200,100,100,0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(200,100,100,0.2)";
          }}
        >
          Нет
        </button>
      </div>
    </div>
  );
}

