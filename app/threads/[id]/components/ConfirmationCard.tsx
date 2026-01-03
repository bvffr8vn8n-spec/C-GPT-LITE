"use client";

import { useEffect } from "react";

interface ConfirmationCardProps {
  message: string;
  toolCallId: string;
  onConfirm: (decision: "yes" | "no") => void;
}

export default function ConfirmationCard({
  message,
  toolCallId,
  onConfirm,
}: ConfirmationCardProps) {
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ConfirmationCard.tsx:18',message:'ConfirmationCard mounted',data:{toolCallId,message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    return () => {
      fetch('http://127.0.0.1:7242/ingest/b95fef05-9189-480c-8864-b788c4ff8392',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ConfirmationCard.tsx:20',message:'ConfirmationCard unmounted',data:{toolCallId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    };
  }, [toolCallId, message]);
  // #endregion
  
  return (
    <div
      style={{
        marginTop: 12,
        padding: "16px",
        borderRadius: 12,
        border: "1px solid rgba(100,150,255,0.4)",
        background: "rgba(100,150,255,0.15)",
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.5, fontWeight: 500 }}>
        {message}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => onConfirm("yes")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(100,200,100,0.5)",
            background: "rgba(100,200,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Да
        </button>
        <button
          onClick={() => onConfirm("no")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(200,100,100,0.5)",
            background: "rgba(200,100,100,0.2)",
            color: "inherit",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Нет
        </button>
      </div>
    </div>
  );
}

