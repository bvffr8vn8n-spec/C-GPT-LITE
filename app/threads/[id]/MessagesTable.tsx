"use client";

import { useState } from "react";

interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: number;
}

interface Props {
  title: string;
  threadId: string;
  columns: string[];
  rows: MessageRow[];
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
}

export default function MessagesTable({ title, threadId, columns, rows, onEdit, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleEditClick = (row: MessageRow) => {
    setEditingId(row.id);
    setEditValue(row.content);
  };

  const handleSave = () => {
    if (editingId && editValue.trim()) {
      onEdit(editingId, editValue.trim());
      setEditingId(null);
      setEditValue("");
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
        📊 {title}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    textAlign: "left",
                    fontWeight: 600,
                  }}
                >
                  {col === "id" ? "ID" : col === "role" ? "Роль" : col === "content" ? "Содержание" : col === "created_at" ? "Дата" : col}
                </th>
              ))}
              <th
                style={{
                  padding: "8px 12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                style={{
                  background: rowIdx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = rowIdx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent";
                }}
              >
                <td
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontFamily: "monospace",
                    fontSize: 11,
                  }}
                >
                  {row.id.substring(0, 8)}...
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {row.role === "user" ? "👤 Пользователь" : "🤖 Ассистент"}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    maxWidth: 400,
                    wordBreak: "break-word",
                  }}
                >
                  {editingId === row.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.2)",
                          background: "rgba(0,0,0,0.3)",
                          color: "inherit",
                          fontSize: 12,
                          fontFamily: "inherit",
                          resize: "vertical",
                          minHeight: 60,
                        }}
                        rows={3}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <button
                          onClick={handleSave}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid rgba(100,200,100,0.5)",
                            background: "rgba(100,200,100,0.2)",
                            color: "inherit",
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          ✓
                        </button>
                        <button
                          onClick={handleCancel}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid rgba(200,100,100,0.5)",
                            background: "rgba(200,100,100,0.2)",
                            color: "inherit",
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{row.content}</div>
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: 11,
                    opacity: 0.7,
                  }}
                >
                  {formatDate(row.created_at)}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    textAlign: "center",
                  }}
                >
                  {editingId === row.id ? null : (
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button
                        onClick={() => handleEditClick(row)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid rgba(100,150,255,0.5)",
                          background: "rgba(100,150,255,0.2)",
                          color: "inherit",
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                        title="Редактировать"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDelete(row.id)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid rgba(255,100,100,0.5)",
                          background: "rgba(255,100,100,0.2)",
                          color: "inherit",
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                        title="Удалить"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

