import { NextResponse } from "next/server";
import * as tableManager from "@/lib/xlsx/table-manager";

/**
 * API endpoint для прямого выполнения опасных действий (без LLM).
 * Используется для UI-редактирования таблицы.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, targetId, newContent, xlsxValue } = body;

    if (action !== "updateXlsxCell") {
      return NextResponse.json(
        { ok: false, error: `Unsupported action: ${action}` },
        { status: 400 }
      );
    }

    if (!targetId || !newContent || xlsxValue === undefined) {
      return NextResponse.json(
        { ok: false, error: "targetId (cell), newContent (sheet), and xlsxValue are required" },
        { status: 400 }
      );
    }

    console.log("🔵 [api/xlsx/perform] Выполнение updateXlsxCell:", { 
      sheet: newContent, 
      cell: targetId, 
      value: xlsxValue,
      timestamp: new Date().toISOString(),
    });

    // Выполняем обновление ячейки
    tableManager.updateCell(newContent, targetId, xlsxValue);

    console.log("✅ [api/xlsx/perform] Ячейка обновлена успешно:", {
      sheet: newContent,
      cell: targetId,
      value: xlsxValue,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: `Cell ${newContent}!${targetId} updated to ${xlsxValue}`,
      action: "updateXlsxCell",
      targetId,
      newContent,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [api/xlsx/perform] Ошибка:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

