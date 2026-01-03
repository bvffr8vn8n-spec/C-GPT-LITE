/**
 * Отладочный скрипт для проверки getRangeValues
 */

import * as tableManager from "../lib/xlsx/table-manager";
import { getRangeValues } from "../lib/xlsx/formula-calculator";
import * as XLSX from "xlsx";

async function main() {
  try {
    console.log("🔵 Отладка getRangeValues для D2:D5...\n");
    
    // Загружаем workbook
    const workbook = tableManager.loadWorkbook();
    const worksheet = workbook.Sheets["Sheet1"];
    
    // Пробуем получить значения через getRangeValues
    console.log("📊 Вызов getRangeValues(worksheet, 'D2', 'D5'):");
    const rangeValues = getRangeValues(worksheet, "D2", "D5");
    console.log("  Результат:", rangeValues);
    console.log("  Длина массива:", rangeValues.length);
    console.log("  Сумма:", rangeValues.reduce((a, b) => a + b, 0));
    
    // Проверяем каждую ячейку вручную
    console.log("\n📋 Проверка ячеек вручную:");
    for (let row = 2; row <= 5; row++) {
      const cell = `D${row}`;
      const cellData = worksheet[cell];
      if (cellData) {
        console.log(`  ${cell}:`, {
          v: cellData.v,
          t: cellData.t,
          f: cellData.f,
          isNumber: typeof cellData.v === "number",
        });
      }
    }
    
  } catch (error) {
    console.error("❌ Ошибка:", error instanceof Error ? error.message : String(error));
    console.error(error);
    process.exit(1);
  }
}

main();

