"use client";

import { useEffect, useRef, useState } from "react";

interface MessageContextMenuProps {
  messageId: string;
  messageText: string;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function MessageContextMenu({
  messageId,
  messageText,
  position,
  onClose,
  onEdit,
  onDelete,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [isVisible, setIsVisible] = useState(false);

  // Анимация появления
  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Корректировка позиции, чтобы меню не выходило за границы экрана
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = position.x;
      let newY = position.y;

      // Проверка правой границы
      if (rect.right > viewportWidth) {
        newX = viewportWidth - rect.width - 10;
      }

      // Проверка нижней границы
      if (rect.bottom > viewportHeight) {
        newY = viewportHeight - rect.height - 10;
      }

      // Проверка левой границы
      if (newX < 10) {
        newX = 10;
      }

      // Проверка верхней границы
      if (newY < 10) {
        newY = 10;
      }

      if (newX !== position.x || newY !== position.y) {
        setAdjustedPosition({ x: newX, y: newY });
      }
    }
  }, [position]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // Небольшая задержка, чтобы не закрыть меню сразу после открытия
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    document.addEventListener("keydown", handleEscape);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1000,
        background: "rgba(30, 30, 30, 0.98)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        borderRadius: 8,
        padding: "6px",
        minWidth: 160,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "scale(1)" : "scale(0.95)",
        transition: "opacity 0.15s ease, transform 0.15s ease",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <button
        onClick={() => {
          onEdit();
          onClose();
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "#ffffff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 10,
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(100, 150, 255, 0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ fontSize: 16 }}>✏️</span>
        <span>Изменить</span>
      </button>

      {/* Разделитель */}
      <div
        style={{
          height: 1,
          background: "rgba(255, 255, 255, 0.1)",
          margin: "4px 0",
        }}
      />

      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "#ff6b6b",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 10,
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 107, 107, 0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ fontSize: 16 }}>🗑️</span>
        <span>Удалить</span>
      </button>
    </div>
  );
}

