/**
 * Парсинг формул Excel для извлечения зависимостей (dependsOn)
 */

/**
 * Извлекает все зависимости из формулы (ячейки и диапазоны)
 * Возвращает массив строк: ["B2", "C2"] или ["B2:B5"]
 */
export function extractDependencies(formula: string): string[] {
  if (!formula || !formula.trim().startsWith("=")) {
    return [];
  }

  const deps = new Set<string>();
  const normalized = formula.trim().substring(1); // Убираем "="

  // Паттерн для диапазонов: A1:B5
  const rangePattern = /([A-Z]+\d+):([A-Z]+\d+)/g;
  let match;
  
  // Сначала находим все диапазоны
  while ((match = rangePattern.exec(normalized)) !== null) {
    const range = match[0]; // Например, "B2:B5"
    deps.add(range);
  }

  // Затем находим одиночные ссылки на ячейки (но не те, что уже в диапазонах)
  // Паттерн для одиночных ячеек: A1, B2, AA12 и т.д.
  const cellPattern = /([A-Z]+\d+)/g;
  let cellMatch;
  
  while ((cellMatch = cellPattern.exec(normalized)) !== null) {
    const cell = cellMatch[0];
    // Проверяем, не является ли эта ячейка частью уже найденного диапазона
    let isInRange = false;
    for (const range of deps) {
      const [from, to] = range.split(":");
      if (isCellInRange(cell, from, to)) {
        isInRange = true;
        break;
      }
    }
    if (!isInRange) {
      deps.add(cell);
    }
  }

  return Array.from(deps).sort();
}

/**
 * Проверяет, находится ли ячейка в диапазоне
 */
function isCellInRange(cell: string, from: string, to: string): boolean {
  const parseCell = (addr: string): { col: number; row: number } => {
    const match = addr.match(/^([A-Z]+)(\d+)$/);
    if (!match) return { col: 0, row: 0 };
    const colStr = match[1];
    const row = parseInt(match[2], 10);
    
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    
    return { col, row };
  };

  const cellCoords = parseCell(cell);
  const fromCoords = parseCell(from);
  const toCoords = parseCell(to);

  return (
    cellCoords.row >= fromCoords.row &&
    cellCoords.row <= toCoords.row &&
    cellCoords.col >= fromCoords.col &&
    cellCoords.col <= toCoords.col
  );
}

