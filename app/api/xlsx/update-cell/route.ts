import { NextResponse } from "next/server";
import * as tableManager from "@/lib/xlsx/table-manager";

/**
 * API endpoint для обновления ячейки XLSX после подтверждения пользователя.
 * Используется после того, как пользователь подтвердил действие через UI.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sheet, cell, value } = body;

    if (!sheet || !cell || value === undefined) {
      return NextResponse.json(
        { ok: false, error: "sheet, cell, and value are required" },
        { status: 400 }
      );
    }

    console.log("🔵 [api/xlsx/update-cell] Выполнение updateCell:", {
      sheet,
      cell,
      value,
      timestamp: new Date().toISOString(),
    });

    // Выполняем обновление ячейки
    tableManager.updateCell(sheet, cell, value);

    console.log("✅ [api/xlsx/update-cell] Ячейка обновлена успешно:", {
      sheet,
      cell,
      value,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: `Cell ${sheet}!${cell} updated to ${value}`,
      sheet,
      cell,
      value,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [api/xlsx/update-cell] Ошибка:", errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
