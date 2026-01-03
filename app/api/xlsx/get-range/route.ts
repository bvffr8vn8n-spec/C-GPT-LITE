import { NextResponse } from "next/server";
import * as tableManager from "@/lib/xlsx/table-manager";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sheet, from, to } = body;

    if (!sheet || !from || !to) {
      return NextResponse.json(
        { error: "sheet, from, and to are required" },
        { status: 400 }
      );
    }

    console.log("🔵 [api/xlsx/get-range] Запрос:", { sheet, from, to });

    const result = tableManager.getRange(sheet, from, to);

    console.log("✅ [api/xlsx/get-range] Успешно:", {
      sheet: result.sheet,
      range: result.range,
      rows: result.data.length,
      cols: result.data[0]?.length || 0,
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [api/xlsx/get-range] Ошибка:", errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

