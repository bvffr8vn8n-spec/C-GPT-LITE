import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateFormula, recalculateFormulas } from "./formula-calculator";
import { extractDependencies } from "./formula-parser";

const XLSX_FILE_PATH = resolve(process.cwd(), "data", "example.xlsx");

export interface CellRange {
  sheet: string;
  from: string; // например "A1"
  to: string; // например "B3"
}

export interface CellAddress {
  sheet: string;
  cell: string; // например "A1"
}

/**
 * Загружает XLSX файл и возвращает workbook
 */
export function loadWorkbook() {
  try {
    const file = readFileSync(XLSX_FILE_PATH);
    return XLSX.read(file, { type: "buffer" });
  } catch (error) {
    throw new Error(`Failed to load XLSX file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Сохраняет workbook в файл
 */
function saveWorkbook(workbook: XLSX.WorkBook) {
  try {
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    writeFileSync(XLSX_FILE_PATH, buffer);
  } catch (error) {
    throw new Error(`Failed to save XLSX file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Парсит адрес ячейки (например "A1") в координаты
 */
function parseCell(cell: string): { row: number; col: number } {
  const match = cell.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid cell address: ${cell}`);
  }
  const colStr = match[1];
  const row = parseInt(match[2], 10) - 1; // XLSX использует 0-based индексы
  
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  col -= 1; // A = 0
  
  return { row, col };
}

/**
 * Конвертирует координаты в адрес ячейки (например {row: 0, col: 0} -> "A1")
 */
function cellAddress(row: number, col: number): string {
  let colStr = "";
  let tempCol = col + 1; // 1-based для конвертации
  while (tempCol > 0) {
    const remainder = (tempCol - 1) % 26;
    colStr = String.fromCharCode(65 + remainder) + colStr;
    tempCol = Math.floor((tempCol - 1) / 26);
  }
  return `${colStr}${row + 1}`;
}

/**
 * Читает диапазон ячеек из таблицы
 */
export function getRange(sheet: string, from: string, to: string): {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
  formulas?: Array<Array<string | null>>; // Матрица формул (null если ячейка не содержит формулу)
} {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  const fromCoords = parseCell(from);
  const toCoords = parseCell(to);
  
  const data: Array<Array<string | number | null>> = [];
  const formulas: Array<Array<string | null>> = [];
  
  for (let row = fromCoords.row; row <= toCoords.row; row++) {
    const rowData: Array<string | number | null> = [];
    const rowFormulas: Array<string | null> = [];
    for (let col = fromCoords.col; col <= toCoords.col; col++) {
      const cellAddr = cellAddress(row, col);
      const cell = worksheet[cellAddr];
      
      if (cell) {
        // Если ячейка содержит формулу, вычисляем её и сохраняем формулу
        if (cell.f) {
          // Всегда вычисляем формулу заново (на случай, если зависимости изменились)
          // Формула в cell.f уже БЕЗ = (стандарт XLSX), добавляем = для calculateFormula
          const calculated = calculateFormula(`=${cell.f}`, worksheet, cellAddr);
          // Используем вычисленное значение только если это число, не строка
          if (calculated !== null && typeof calculated !== "string") {
            rowData.push(calculated);
          } else if (cell.v !== null && cell.v !== undefined && typeof cell.v !== "string" && typeof cell.v !== "boolean") {
            // Если вычисление не удалось, но есть сохранённое числовое значение - используем его
            rowData.push(cell.v);
          } else {
            // Если ничего не получилось, показываем null
            rowData.push(null);
          }
          rowFormulas.push(cell.f); // Сохраняем формулу БЕЗ =
        } else {
          rowData.push(cell.v ?? null);
          rowFormulas.push(null); // Нет формулы
        }
      } else {
        rowData.push(null);
        rowFormulas.push(null);
      }
    }
    data.push(rowData);
    formulas.push(rowFormulas);
  }
  
  // Если первая строка содержит заголовки (все строковые значения), выделяем их
  const firstRow = data[0];
  const hasHeaders = firstRow && firstRow.every((cell) => typeof cell === "string" || cell === null);
  
  return {
    sheet,
    range: `${from}:${to}`,
    data,
    headers: hasHeaders ? (firstRow as string[]) : undefined,
    formulas, // Добавляем матрицу формул
  };
}

/**
 * Обновляет значение ячейки
 */
export function updateCell(sheet: string, cell: string, value: string | number): void {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  const coords = parseCell(cell);
  
  // Создаём или обновляем ячейку
  // Если значение начинается с =, это формула
  const isFormula = typeof value === "string" && value.trim().startsWith("=");
  
  if (isFormula) {
    let formulaStr = value.trim();
    // Убираем = в начале, если есть (для сохранения в поле f)
    const formulaWithoutEquals = formulaStr.startsWith("=") ? formulaStr.substring(1).trim() : formulaStr;
    
    // Пытаемся вычислить формулу сразу
    let calculatedValue: any = null;
    try {
      // calculateFormula сам убирает =, но передаём формулу с = для совместимости
      calculatedValue = calculateFormula(formulaStr, worksheet, cell);
    } catch (error) {
      console.warn(`⚠️ [updateCell] Не удалось вычислить формулу ${formulaStr}:`, error);
    }
    
    // Сохраняем формулу БЕЗ = в поле f (стандарт XLSX)
    // В поле v сохраняем вычисленное значение (число) или null, если не удалось вычислить
    worksheet[cell] = {
      t: calculatedValue !== null && typeof calculatedValue === "number" ? "n" : "s",
      f: formulaWithoutEquals, // Формула БЕЗ = (стандарт XLSX)
      v: calculatedValue !== null && typeof calculatedValue !== "string" ? calculatedValue : null, // Только вычисленное значение, не строка
    };
  } else {
    // Обычное значение
    worksheet[cell] = {
      t: typeof value === "number" ? "n" : "s",
      v: value,
    };
  }
  
  // Обновляем диапазон листа
  const currentRange = worksheet["!ref"];
  if (currentRange) {
    const range = XLSX.utils.decode_range(currentRange);
    const cellCoords = parseCell(cell);
    if (cellCoords.row > range.e.r) range.e.r = cellCoords.row;
    if (cellCoords.col > range.e.c) range.e.c = cellCoords.col;
    worksheet["!ref"] = XLSX.utils.encode_range(range);
  } else {
    // Если лист пустой, создаём минимальный диапазон
    const cellCoords = parseCell(cell);
    worksheet["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: cellCoords.row, c: cellCoords.col },
    });
  }
  
  // Пересчитываем все формулы в листе после обновления ячейки
  recalculateFormulas(worksheet);
  
  saveWorkbook(workbook);
}

/**
 * Получает формулу из ячейки
 * Проверяет как поле f (настоящая формула), так и значение v (если это строка, начинающаяся с =)
 */
export function getFormula(sheet: string, cell: string): string | null {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  const cellData = worksheet[cell];
  
  if (!cellData) {
    return null;
  }
  
  // Если ячейка содержит формулу в поле f (настоящая формула)
  if (cellData.f) {
    return cellData.f;
  }
  
  // Если формула сохранена как текст (значение начинается с =)
  if (cellData.v && typeof cellData.v === "string" && cellData.v.trim().startsWith("=")) {
    return cellData.v.trim();
  }
  
  return null;
}

/**
 * Получает значение ячейки (примитив: string | number | boolean | null)
 * Если ячейка содержит формулу, вычисляет её
 */
export function getCellValue(sheet: string, cell: string): string | number | boolean | null {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  const cellData = worksheet[cell];
  
  if (!cellData) {
    return null;
  }
  
  // Если ячейка содержит формулу, вычисляем её
  if (cellData.f) {
    const calculated = calculateFormula(cellData.f, worksheet, cell);
    return calculated !== null ? calculated : cellData.v ?? null;
  }
  
  return cellData.v ?? null;
}

/**
 * Получает значения из диапазона ячеек
 * Возвращает плоский массив значений
 */
export function getRangeValues(sheet: string, range: string): Array<string | number | boolean | null> {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  
  // Парсим диапазон (например, "A1:B3" или "B2:B5")
  const rangeMatch = range.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
  if (!rangeMatch) {
    throw new Error(`Invalid range format: ${range}. Expected format: A1:B3`);
  }
  
  const from = rangeMatch[1];
  const to = rangeMatch[2];
  const fromCoords = parseCell(from);
  const toCoords = parseCell(to);
  
  const values: Array<string | number | boolean | null> = [];
  
  for (let row = fromCoords.row; row <= toCoords.row; row++) {
    for (let col = fromCoords.col; col <= toCoords.col; col++) {
      const cellAddr = cellAddress(row, col);
      const cell = worksheet[cellAddr];
      
      if (cell) {
        // Если ячейка содержит формулу, вычисляем её
        if (cell.f) {
          const calculated = calculateFormula(cell.f, worksheet, cellAddr);
          values.push(calculated !== null ? calculated : cell.v ?? null);
        } else {
          values.push(cell.v ?? null);
        }
      } else {
        values.push(null);
      }
    }
  }
  
  return values;
}

/**
 * Получает список всех листов
 */
export function getSheets(): string[] {
  const workbook = loadWorkbook();
  return workbook.SheetNames;
}

/**
 * ШАГ E: Определяет фактически используемый диапазон листа (без пустых строк/столбцов справа и снизу)
 */
/**
 * 2) Получает используемый диапазон листа (used range) - фактически заполненные ячейки
 * Сканирует реальные ячейки, не полагаясь только на !ref
 */
export function getUsedRange(sheet: string): { from: string; to: string } | null {
  return detectUsedRange(sheet);
}

/**
 * Alias для обратной совместимости
 */
export function detectUsedRange(sheet: string): { from: string; to: string } | null {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  const range = worksheet["!ref"];
  
  if (!range) {
    // Лист пустой
    return null;
  }
  
  const decoded = XLSX.utils.decode_range(range);
  
  // Находим минимальные и максимальные занятые ячейки
  let minRow = decoded.s.r;
  let maxRow = decoded.e.r;
  let minCol = decoded.s.c;
  let maxCol = decoded.e.c;
  
  // Сканируем все ячейки в диапазоне
  for (let row = decoded.s.r; row <= decoded.e.r; row++) {
    for (let col = decoded.s.c; col <= decoded.e.c; col++) {
      const cellAddr = cellAddress(row, col);
      const cell = worksheet[cellAddr];
      
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") {
        // Ячейка занята
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
    }
  }
  
  // Конвертируем обратно в адреса
  const from = cellAddress(minRow, minCol);
  const to = cellAddress(maxRow, maxCol);
  
  return { from, to };
}

/**
 * Утилита для обрезки пустых строк и столбцов справа и снизу
 */
export function trimSpreadsheetData(
  data: Array<Array<string | number | null>>,
  headers?: string[]
): {
  data: Array<Array<string | number | null>>;
  headers?: string[];
} {
  if (!data || data.length === 0) {
    return { data: [], headers: headers ? [] : undefined };
  }

  // Проверяем, является ли ячейка непустой
  const isNonEmpty = (cell: string | number | null | undefined): boolean => {
    if (cell === null || cell === undefined) return false;
    if (typeof cell === "string") {
      return cell.trim().length > 0;
    }
    return true; // number всегда непустой
  };

  // Находим последнюю непустую строку
  let lastNonEmptyRow = -1;
  for (let rowIdx = data.length - 1; rowIdx >= 0; rowIdx--) {
    const row = data[rowIdx];
    if (row && row.some((cell) => isNonEmpty(cell))) {
      lastNonEmptyRow = rowIdx;
      break;
    }
  }

  // Если все строки пустые
  if (lastNonEmptyRow === -1) {
    return { data: [], headers: headers ? [] : undefined };
  }

  // Находим последний непустой столбец
  let lastNonEmptyCol = -1;
  for (let colIdx = (data[0]?.length || 0) - 1; colIdx >= 0; colIdx--) {
    let hasNonEmpty = false;
    for (let rowIdx = 0; rowIdx <= lastNonEmptyRow; rowIdx++) {
      if (isNonEmpty(data[rowIdx]?.[colIdx])) {
        hasNonEmpty = true;
        break;
      }
    }
    if (hasNonEmpty) {
      lastNonEmptyCol = colIdx;
      break;
    }
  }

  // Если все столбцы пустые
  if (lastNonEmptyCol === -1) {
    return { data: [], headers: headers ? [] : undefined };
  }

  // Обрезаем данные
  const trimmedData = data
    .slice(0, lastNonEmptyRow + 1)
    .map((row) => row.slice(0, lastNonEmptyCol + 1));

  // Обрезаем headers если есть
  const trimmedHeaders = headers
    ? headers.slice(0, lastNonEmptyCol + 1)
    : undefined;

  return {
    data: trimmedData,
    headers: trimmedHeaders,
  };
}

