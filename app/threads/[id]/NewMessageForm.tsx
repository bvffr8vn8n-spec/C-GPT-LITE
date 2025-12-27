"use client";

import { useState } from "react";

type Props = {
  threadId: string;
  onSend?: () => void;
};

export default function NewMessageForm({ threadId, onSend }: Props) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    const text = message.trim();
    setMessage("");
    setIsLoading(true);

    try {
      // Отправка сообщения через ChatClient (useChat)
      // Эта форма используется только для статического отображения
      // Реальная отправка происходит через ChatClient
      if (onSend) {
        onSend();
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Введите сообщение..."
        disabled={isLoading}
        rows={3}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontSize: 14,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <button
        type="submit"
        disabled={!message.trim() || isLoading}
        style={{
          marginTop: 8,
          padding: "10px 20px",
          borderRadius: 8,
          border: "none",
          background: isLoading || !message.trim()
            ? "rgba(100,150,255,0.5)"
            : "rgba(100,150,255,0.8)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          cursor: isLoading || !message.trim() ? "not-allowed" : "pointer",
          opacity: isLoading || !message.trim() ? 0.5 : 1,
        }}
      >
        {isLoading ? "Отправка..." : "Отправить"}
      </button>
    </form>
  );
}

