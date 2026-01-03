/**
 * Скрипт для добавления формулы =SUM(D2:D5) в ячейку D6
 */

import * as tableManager from "../lib/xlsx/table-manager";

async function main() {
  try {
    console.log("🔵 Добавление формулы =SUM(D2:D5) в ячейку D6...");
    
    // Добавляем формулу в D6
    tableManager.updateCell("Sheet1", "D6", "=SUM(D2:D5)");
    
    console.log("✅ Формула успешно добавлена!");
    
    // Проверяем результат
    const formula = tableManager.getFormula("Sheet1", "D6");
    const value = tableManager.getCellValue("Sheet1", "D6");
    
    console.log("📊 Результат:");
    console.log(`  Формула: ${formula}`);
    console.log(`  Вычисленное значение: ${value}`);
    
    // Показываем значения из диапазона D2:D5
    const range = tableManager.getRange("Sheet1", "D2", "D5");
    console.log("\n📋 Значения в диапазоне D2:D5:");
    range.data.forEach((row, idx) => {
      const rowNum = idx + 2; // D2, D3, D4, D5
      console.log(`  D${rowNum}: ${row[0] ?? "пусто"}`);
    });
    
  } catch (error) {
    console.error("❌ Ошибка:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

