"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewThreadForm() {
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (!res.ok) {
        throw new Error("Failed to create thread");
      }

      const { id } = await res.json();
      setTitle("");
      router.push(`/threads/${id}`);
      router.refresh();
    } catch (error) {
      console.error("Error creating thread:", error);
      alert("Ошибка при создании треда");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название треда"
        disabled={isLoading}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontSize: 13,
        }}
      />
      <button
        type="submit"
        disabled={!title.trim() || isLoading}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "8px 12px",
          borderRadius: 6,
          border: "none",
          background: isLoading
            ? "rgba(100,150,255,0.5)"
            : "rgba(100,150,255,0.8)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 500,
          cursor: isLoading || !title.trim() ? "not-allowed" : "pointer",
          opacity: isLoading || !title.trim() ? 0.5 : 1,
        }}
      >
        {isLoading ? "Создание..." : "Создать"}
      </button>
    </form>
  );
}

