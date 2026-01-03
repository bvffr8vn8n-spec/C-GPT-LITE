import * as XLSX from "xlsx";
// Используем динамический импорт для formulajs, т.к. это CommonJS модуль
const formulajs = require("formulajs");

/**
 * Конвертирует номер колонки в буквы (1 -> A, 27 -> AA)
 */
function numToCol(num: number): string {
  let col = "";
  while (num > 0) {
    const remainder = (num - 1) % 26;
    col = String.fromCharCode(65 + remainder) + col;
    num = Math.floor((num - 1) / 26);
  }
  return col;
}

/**
 * Получает значения из диапазона ячеек
 * Экспортируем для использования в других модулях
 */
export function getRangeValues(worksheet: XLSX.WorkSheet, from: string, to: string): number[] {
  const values: number[] = [];
  
  // Парсим адреса ячеек
  const fromMatch = from.match(/^([A-Z]+)(\d+)$/);
  const toMatch = to.match(/^([A-Z]+)(\d+)$/);
  
  if (!fromMatch || !toMatch) return values;
  
  const fromCol = fromMatch[1];
  const fromRow = parseInt(fromMatch[2], 10);
  const toCol = toMatch[1];
  const toRow = parseInt(toMatch[2], 10);
  
  // Конвертируем буквы колонок в числа
  const colToNum = (col: string): number => {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num;
  };
  
  const fromColNum = colToNum(fromCol);
  const toColNum = colToNum(toCol);
  
  // Собираем значения из диапазона
  for (let row = fromRow; row <= toRow; row++) {
    for (let colNum = fromColNum; colNum <= toColNum; colNum++) {
      const colStr = numToCol(colNum);
      const cellAddr = `${colStr}${row}`;
      const cell = worksheet[cellAddr];
      
      if (cell) {
        // Если ячейка содержит формулу, используем вычисленное значение (cell.v), если оно есть
        // Если cell.v нет или оно не число, пытаемся вычислить формулу
        if (cell.f) {
          // Сначала проверяем, есть ли уже вычисленное значение
          if (cell.v !== null && cell.v !== undefined && typeof cell.v === "number") {
            values.push(cell.v);
          } else {
            // Пытаемся вычислить формулу
            const calculated = calculateFormula(cell.f, worksheet, cellAddr);
            values.push(typeof calculated === "number" ? calculated : 0);
          }
        } else {
          const value = cell.v;
          if (typeof value === "number") {
            values.push(value);
          } else if (value !== null && value !== undefined) {
            // Пытаемся преобразовать строку в число
            const numValue = parseFloat(String(value));
            if (!isNaN(numValue)) {
              values.push(numValue);
            } else {
              values.push(0); // Нечисловые значения считаем 0 для SUM, AVERAGE и т.д.
            }
          } else {
            values.push(0); // Пустые ячейки = 0
          }
        }
      }
    }
  }
  
  return values;
}

/**
 * Вычисляет значение формулы Excel
 * Поддерживает русские названия функций (СУММ, СРЗНАЧ и т.д.)
 */
export function calculateFormula(
  formula: string,
  worksheet: XLSX.WorkSheet,
  cellAddress: string
): any {
  try {
    // Нормализуем формулу: убираем = в начале, заменяем русские названия функций на английские
    let normalizedFormula = formula.trim();
    // Убираем = в начале, если есть
    if (normalizedFormula.startsWith("=")) {
      normalizedFormula = normalizedFormula.substring(1).trim();
    }
    
    // Заменяем русские названия функций на английские
    const functionMap: Record<string, string> = {
      "СУММ": "SUM",
      "СРЗНАЧ": "AVERAGE",
      "СЧЁТ": "COUNT",
      "МАКС": "MAX",
      "МИН": "MIN",
      "ЕСЛИ": "IF",
      "СУММЕСЛИ": "SUMIF",
      "СЧЁТЕСЛИ": "COUNTIF",
    };
    
    for (const [russian, english] of Object.entries(functionMap)) {
      const regex = new RegExp(russian, "gi");
      normalizedFormula = normalizedFormula.replace(regex, english);
    }
    
    // Парсим диапазоны (например, C2:C3) и получаем значения ячеек
    const cellValues: Record<string, any> = {};
    
    // Извлекаем все ссылки на ячейки из формулы
    const cellRefRegex = /([A-Z]+\d+)/g;
    const cellRefs = normalizedFormula.match(cellRefRegex) || [];
    
    // Получаем значения всех ячеек, на которые ссылается формула
    for (const ref of cellRefs) {
      // Предотвращаем циклические ссылки
      if (ref === cellAddress) {
        console.warn(`⚠️ [formula-calculator] Обнаружена циклическая ссылка: ${cellAddress} ссылается на себя`);
        cellValues[ref] = 0;
        continue;
      }
      
      const cell = worksheet[ref];
      if (cell) {
        // Если ячейка содержит формулу, вычисляем её рекурсивно
        // ВАЖНО: используем актуальное вычисленное значение, а не старое cell.v
        if (cell.f) {
          // Вычисляем формулу рекурсивно, чтобы получить актуальное значение
          cellValues[ref] = calculateFormula(cell.f, worksheet, ref);
        } else {
          // Обычное значение - используем cell.v
          cellValues[ref] = cell.v ?? null;
        }
      } else {
        cellValues[ref] = 0; // Пустая ячейка = 0 для вычислений
      }
    }
    
    // Заменяем ссылки на ячейки в формуле на их значения
    let formulaWithValues = normalizedFormula;
    for (const [ref, value] of Object.entries(cellValues)) {
      // Заменяем только полные ссылки (не внутри других ссылок)
      const regex = new RegExp(`\\b${ref}\\b`, "g");
      formulaWithValues = formulaWithValues.replace(regex, String(value ?? 0));
    }
    
    // Вычисляем формулу используя formulajs
    // Формула должна быть в формате JavaScript
    // Например: SUM([1,2,3]) или A1+B1 или C2*2
    
    // Для простых арифметических операций (после замены ссылок на значения)
    // Проверяем, что формула содержит только числа, операторы и скобки
    const cleanFormula = formulaWithValues.replace(/\s/g, "");
    if (/^[\d\.\+\-\*\/\(\)]+$/.test(cleanFormula)) {
      // Простая арифметическая формула (например, 10*2 или (5+3)*2)
      try {
        // Используем eval для простых арифметических выражений
        // ВНИМАНИЕ: eval опасен, но здесь вход контролируется (только числа и операторы)
        const result = eval(cleanFormula);
        return typeof result === "number" ? result : null;
      } catch (error) {
        console.error(`❌ [formula-calculator] Ошибка вычисления арифметического выражения ${cleanFormula}:`, error);
        return null;
      }
    }
    
    // Для функций (SUM, AVERAGE и т.д.)
    if (/^[A-Z]+\(/.test(normalizedFormula)) {
      // Извлекаем имя функции и аргументы
      const functionMatch = normalizedFormula.match(/^([A-Z]+)\((.+)\)$/);
      if (functionMatch) {
        const functionName = functionMatch[1];
        const argsStr = functionMatch[2];
        
        // Парсим аргументы - может быть диапазон (C2:C3) или отдельные значения
        // В Excel точка с запятой (;) используется как разделитель аргументов в некоторых локалях
        let args: number[] = [];
        
        // Заменяем точку с запятой на запятую для унификации
        const normalizedArgsStr = argsStr.replace(/;/g, ",");
        
        // Проверяем, есть ли диапазон в аргументах
        const rangeMatch = normalizedArgsStr.match(/([A-Z]+\d+):([A-Z]+\d+)/);
        if (rangeMatch) {
          // Это диапазон - получаем значения из диапазона
          const rangeValues = getRangeValues(worksheet, rangeMatch[1], rangeMatch[2]);
          args = rangeValues;
        } else {
          // Отдельные значения или ссылки на ячейки
          const parts = normalizedArgsStr.split(",");
          args = parts.map(part => {
            const trimmed = part.trim();
            // Если это ссылка на ячейку
            if (/^[A-Z]+\d+$/.test(trimmed)) {
              const value = cellValues[trimmed];
              return typeof value === "number" ? value : (parseFloat(String(value ?? 0)) || 0);
            }
            // Если это число
            return parseFloat(trimmed) || 0;
          });
        }
        
        // Вызываем функцию из formulajs
        const formulaFunction = (formulajs as any)[functionName];
        if (formulaFunction && typeof formulaFunction === "function" && args.length > 0) {
          try {
            return formulaFunction(...args);
          } catch (error) {
            console.error(`❌ [formula-calculator] Ошибка вызова функции ${functionName}:`, error);
            return null;
          }
        } else if (!formulaFunction) {
          console.warn(`⚠️ [formula-calculator] Функция ${functionName} не найдена в formulajs`);
        }
      }
    }
    
    // Если не удалось вычислить, возвращаем исходную формулу
    return null;
  } catch (error) {
    console.error("❌ [formula-calculator] Ошибка вычисления формулы:", error);
    return null;
  }
}


/**
 * Пересчитывает все формулы в листе
 * ВАЖНО: пересчитывает в несколько проходов, чтобы учесть зависимости между формулами
 */
export function recalculateFormulas(worksheet: XLSX.WorkSheet): void {
  // Находим все ячейки с формулами
  const range = worksheet["!ref"];
  if (!range) return;
  
  const decoded = XLSX.utils.decode_range(range);
  const formulasToRecalculate: { cellAddr: string; formula: string }[] = [];
  
  // Собираем все формулы
  for (let row = decoded.s.r; row <= decoded.e.r; row++) {
    for (let col = decoded.s.c; col <= decoded.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddr];
      
      if (cell && cell.f) {
        formulasToRecalculate.push({ cellAddr, formula: cell.f });
      }
    }
  }
  
  // Пересчитываем формулы в несколько проходов
  // Это необходимо, если формулы зависят друг от друга
  // В идеале нужно строить граф зависимостей, но для простоты делаем несколько проходов
  const maxPasses = 10; // Максимум 10 проходов для предотвращения бесконечного цикла
  let hasChanges = true;
  let pass = 0;
  
  while (hasChanges && pass < maxPasses) {
    hasChanges = false;
    pass++;
    
    for (const { cellAddr, formula } of formulasToRecalculate) {
      const cell = worksheet[cellAddr];
      if (!cell) continue;
      
      // Вычисляем формулу
      const calculated = calculateFormula(formula, worksheet, cellAddr);
      
      // Обновляем значение, если оно изменилось
      if (calculated !== null) {
        const oldValue = cell.v;
        cell.v = calculated;
        cell.t = typeof calculated === "number" ? "n" : "s";
        
        // Проверяем, изменилось ли значение
        if (oldValue !== calculated) {
          hasChanges = true;
        }
      }
    }
  }
  
  if (pass >= maxPasses) {
    console.warn(`⚠️ [recalculateFormulas] Достигнут максимум проходов (${maxPasses}). Возможны циклические зависимости.`);
  }
}

