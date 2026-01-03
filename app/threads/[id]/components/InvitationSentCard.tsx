"use client";

interface InvitationSentCardProps {
  part: any;
}

export default function InvitationSentCard({ part }: InvitationSentCardProps) {
  const state = part?.state;
  const output = part?.output;
  const input = part?.input;

  if (state === "input-available" || state === "input-streaming") {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "16px",
          borderRadius: 12,
          border: "1px solid rgba(100,150,255,0.3)",
          background: "rgba(100,150,255,0.1)",
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.8, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>📧</span>
          <span><b>Отправка приглашений...</b></span>
        </div>
      </div>
    );
  }

  if (state === "output-available" && output) {
    const emails = output.emails || [];
    const sent = output.sent || 0;

    return (
      <div
        style={{
          marginTop: 12,
          padding: "20px",
          borderRadius: 12,
          border: "1px solid rgba(100,200,100,0.4)",
          background: "rgba(100,200,100,0.15)",
          boxShadow: "0 2px 8px rgba(100,200,100,0.2)",
        }}
      >
        <div style={{ fontSize: 16, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>✅</span>
          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>
            Приглашение отправлено
          </span>
        </div>
        
        {emails.length > 0 && (
          <div style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.9)" }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ opacity: 0.9 }}>Приглашение отправлено на:</span>
            </div>
            <div
              style={{
                padding: "12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {emails.map((email: string, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.08)",
                      fontSize: 14,
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.95)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ opacity: 0.7, fontSize: 12 }}>📧</span>
                    <span>{email}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div style={{ fontSize: 13, opacity: 0.8, fontStyle: "italic" }}>
          Всего отправлено: <b>{sent}</b> {sent === 1 ? "приглашение" : sent < 5 ? "приглашения" : "приглашений"}
        </div>
      </div>
    );
  }

  return null;
}

