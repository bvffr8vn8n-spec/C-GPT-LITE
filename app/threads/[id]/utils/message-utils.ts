import type { UIMessage } from "ai";

/**
 * Извлекает текст из UIMessage
 */
export function getText(m: UIMessage): string {
  const parts = (m.parts ?? []) as Array<any>;
  return parts.map((p) => (p?.type === "text" ? String(p.text ?? "") : "")).join("");
}

/**
 * Проверяет, является ли part tool part
 */
export function isToolPart(part: any): boolean {
  return part?.type?.startsWith("tool-") || part?.type === "dynamic-tool";
}

/**
 * Получает tool name из part
 */
export function getToolName(part: any): string | null {
  if (part?.type?.startsWith("tool-")) {
    return part.type.replace("tool-", "");
  }
  if (part?.type === "dynamic-tool") {
    return part.toolName || null;
  }
  return null;
}

