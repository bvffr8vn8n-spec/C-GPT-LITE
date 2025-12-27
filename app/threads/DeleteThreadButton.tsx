"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

type Props = {
  threadId: string;
  threadTitle: string;
};

export default function DeleteThreadButton({ threadId, threadTitle }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDelete() {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setPending(true);

    try {
      // Если удаляем текущий открытый тред, сначала переходим на /threads
      const isCurrentThread = pathname === `/threads/${threadId}`;
      
      if (isCurrentThread) {
        // Редирект на приветственную страницу ДО удаления
        router.push("/threads");
        // Небольшая задержка для завершения навигации
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Удаляем тред
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Failed to delete thread");
      }

      // Обновляем сайдбар (список тредов)
      router.refresh();
      
      // Если это был текущий тред, мы уже на /threads, просто обновляем сайдбар
      // Если это был другой тред, остаёмся на текущей странице, обновляем сайдбар
    } catch (err: any) {
      alert(err?.message ?? "Ошибка при удалении");
      setPending(false);
      setShowConfirm(false);
    }
  }

  function handleCancel() {
    setShowConfirm(false);
  }

  if (showConfirm) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Удалить "{threadTitle}"?</span>
        <button
          onClick={handleDelete}
          disabled={pending}
          style={{
            padding: "4px 8px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid rgba(255,100,100,0.5)",
            background: "rgba(255,100,100,0.2)",
            color: "#ff6b6b",
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "..." : "Да"}
        </button>
        <button
          onClick={handleCancel}
          disabled={pending}
          style={{
            padding: "4px 8px",
            fontSize: 12,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent",
            cursor: pending ? "default" : "pointer",
          }}
        >
          Нет
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      style={{
        padding: "4px 8px",
        fontSize: 12,
        borderRadius: 6,
        border: "1px solid rgba(255,100,100,0.3)",
        background: "transparent",
        color: "#ff6b6b",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.5 : 1,
      }}
      title="Удалить чат"
    >
      ✕
    </button>
  );
}

