"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import DeleteThreadButton from "./DeleteThreadButton";

type Props = {
  threadId: string;
  title: string;
  createdAt: number;
};

export default function ThreadItem({ threadId, title, createdAt }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const pathname = usePathname();
  const isActive = pathname === `/threads/${threadId}`;

  return (
    <div
      style={{
        position: "relative",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link
        href={"/threads/" + threadId}
        style={{
          display: "block",
          padding: "12px 16px",
          textDecoration: "none",
          color: "inherit",
          borderRadius: 8,
          margin: "0 8px",
          background: isActive
            ? "rgba(100,150,255,0.15)"
            : isHovered
            ? "rgba(255,255,255,0.05)"
            : "transparent",
          borderLeft: isActive ? "3px solid rgba(100,150,255,0.8)" : "3px solid transparent",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            fontWeight: 500,
            fontSize: 14,
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        <div
          style={{
            opacity: 0.6,
            fontSize: 11,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {new Date(createdAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
          })}
        </div>
      </Link>
      <div
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          opacity: isHovered ? 1 : 0,
          transition: "opacity 0.2s",
        }}
      >
        <DeleteThreadButton threadId={threadId} threadTitle={title} />
      </div>
    </div>
  );
}

