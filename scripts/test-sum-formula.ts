/**
 * Тестовый скрипт для проверки вычисления формулы =SUM(D2:D5)
 */

import * as tableManager from "../lib/xlsx/table-manager";
import { calculateFormula } from "../lib/xlsx/formula-calculator";
import * as XLSX from "xlsx";

async function main() {
  try {
    console.log("🔵 Тестирование формулы =SUM(D2:D5)...\n");
    
    // Загружаем workbook
    const workbook = tableManager.loadWorkbook();
    const worksheet = workbook.Sheets["Sheet1"];
    
    // Проверяем значения в D2:D5
    console.log("📋 Значения в диапазоне D2:D5:");
    for (let row = 2; row <= 5; row++) {
      const cell = `D${row}`;
      const cellData = worksheet[cell];
      if (cellData) {
        console.log(`  ${cell}:`, {
          v: cellData.v,
          t: cellData.t,
          f: cellData.f,
          type: typeof cellData.v,
        });
      } else {
        console.log(`  ${cell}: пусто`);
      }
    }
    
    // Проверяем формулу в D6
    console.log("\n📊 Формула в D6:");
    const d6Cell = worksheet["D6"];
    if (d6Cell) {
      console.log("  Данные ячейки:", {
        v: d6Cell.v,
        t: d6Cell.t,
        f: d6Cell.f,
      });
      
      if (d6Cell.f) {
        console.log("\n🔢 Попытка вычисления формулы:", d6Cell.f);
        const calculated = calculateFormula(d6Cell.f, worksheet, "D6");
        console.log("  Результат вычисления:", calculated);
        console.log("  Тип результата:", typeof calculated);
      }
    } else {
      console.log("  Ячейка D6 не найдена");
    }
    
    // Пробуем вычислить напрямую
    console.log("\n🧪 Прямое вычисление =SUM(D2:D5):");
    const directResult = calculateFormula("=SUM(D2:D5)", worksheet, "D6");
    console.log("  Результат:", directResult);
    
  } catch (error) {
    console.error("❌ Ошибка:", error instanceof Error ? error.message : String(error));
    console.error(error);
    process.exit(1);
  }
}

main();

