"use client";

import { useEffect } from "react";

interface DangerousActionResultCardProps {
  part: any;
  onThreadDeleted?: () => void;
}

export default function DangerousActionResultCard({
  part,
  onThreadDeleted,
}: DangerousActionResultCardProps) {
  const state = part?.state;
  const output = part?.output;
  const input = part?.input;

  useEffect(() => {
    if (state === "output-available" && output && input?.action === "deleteThread" && output.ok === true) {
      const timer = setTimeout(() => {
        if (onThreadDeleted) {
          onThreadDeleted();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state, output, input?.action, onThreadDeleted]);

  if (state === "input-available" || state === "input-streaming") {
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid rgba(150,150,255,0.2)",
          background: "rgba(150,150,255,0.08)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          ⚙️ <b>Выполнение операции...</b>
        </div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          {input?.action === "deleteThread" && "Удаление треда..."}
          {input?.action === "deleteMessage" && "Удаление сообщения..."}
          {input?.action === "updateMessage" && "Обновление сообщения..."}
        </div>
      </div>
    );
  }

  if (state === "output-available" && output) {
    const isSuccess = output.ok === true;
    return (
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          borderRadius: 10,
          border: isSuccess
            ? "1px solid rgba(100,200,100,0.3)"
            : "1px solid rgba(255,100,100,0.3)",
          background: isSuccess
            ? "rgba(100,200,100,0.1)"
            : "rgba(255,100,100,0.1)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          {isSuccess ? "✅" : "❌"} <b>{isSuccess ? "Операция выполнена" : "Ошибка"}</b>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          {output.message}
        </div>
      </div>
    );
  }

  return null;
}

