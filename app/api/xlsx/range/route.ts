import { NextResponse } from "next/server";
import * as tableManager from "@/lib/xlsx/table-manager";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sheet = searchParams.get("sheet");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!sheet) {
      return NextResponse.json(
        { error: "sheet parameter is required" },
        { status: 400 }
      );
    }

    const actualFrom = from || "A1";
    const actualTo = to || "H30";

    // Если from/to не указаны, пытаемся определить используемый диапазон
    let finalFrom = actualFrom;
    let finalTo = actualTo;
    if (!from || !to) {
      try {
        const usedRange = tableManager.getUsedRange(sheet);
        if (usedRange) {
          finalFrom = usedRange.from;
          finalTo = usedRange.to;
        }
      } catch (e) {
        // Игнорируем ошибку, используем дефолты
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("🔵 [api/xlsx/range] GET запрос:", { sheet, from: finalFrom, to: finalTo });
    }

    const result = tableManager.getRange(sheet, finalFrom, finalTo);
    const trimmed = tableManager.trimSpreadsheetData(result.data, result.headers);

    // Обрезаем формулы так же, как данные
    let trimmedFormulas: Array<Array<string | null>> | undefined = undefined;
    if (result.formulas) {
      // Используем ту же логику обрезки, что и для данных
      const trimmedDataResult = tableManager.trimSpreadsheetData(
        result.formulas.map(row => row.map(cell => cell ?? null)),
        result.headers
      );
      trimmedFormulas = trimmedDataResult.data as Array<Array<string | null>>;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("✅ [api/xlsx/range] Успешно:", {
        sheet: result.sheet,
        range: result.range,
        rows: trimmed.data.length,
        cols: trimmed.data[0]?.length || 0,
        hasFormulas: !!trimmedFormulas,
      });
    }

    return NextResponse.json({
      sheet: result.sheet,
      range: result.range,
      data: trimmed.data,
      headers: trimmed.headers,
      formulas: trimmedFormulas,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [api/xlsx/range] Ошибка:", errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

