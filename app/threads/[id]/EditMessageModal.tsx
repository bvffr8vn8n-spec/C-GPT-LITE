"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  currentText: string;
  onSave: (newText: string) => void;
  onCancel: () => void;
}

export default function EditMessageModal({ currentText, onSave, onCancel }: Props) {
  const [text, setText] = useState(currentText);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Фокус на input при открытии
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSave(text.trim());
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        style={{
          background: "#1a1a1a",
          borderRadius: 12,
          padding: "24px",
          minWidth: 400,
          maxWidth: "90vw",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>
          ✏️ Изменить сообщение
        </h2>
        
        <form onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Введите новый текст сообщения..."
            style={{
              width: "100%",
              minHeight: 120,
              padding: "12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
              marginBottom: 16,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleSubmit(e);
              }
            }}
          />
          
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!text.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(100,150,255,0.5)",
                background: text.trim() ? "rgba(100,150,255,0.3)" : "rgba(100,150,255,0.1)",
                color: "inherit",
                cursor: text.trim() ? "pointer" : "not-allowed",
                fontSize: 14,
                opacity: text.trim() ? 1 : 0.5,
              }}
            >
              Сохранить
            </button>
          </div>
        </form>
        
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
          Ctrl+Enter для сохранения
        </div>
      </div>
    </div>
  );
}

