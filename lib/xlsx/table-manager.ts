import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
function loadWorkbook() {
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
} {
  const workbook = loadWorkbook();
  
  if (!workbook.SheetNames.includes(sheet)) {
    throw new Error(`Sheet "${sheet}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  
  const worksheet = workbook.Sheets[sheet];
  const fromCoords = parseCell(from);
  const toCoords = parseCell(to);
  
  const data: Array<Array<string | number | null>> = [];
  
  for (let row = fromCoords.row; row <= toCoords.row; row++) {
    const rowData: Array<string | number | null> = [];
    for (let col = fromCoords.col; col <= toCoords.col; col++) {
      const cellAddr = cellAddress(row, col);
      const cell = worksheet[cellAddr];
      rowData.push(cell ? (cell.v ?? null) : null);
    }
    data.push(rowData);
  }
  
  // Если первая строка содержит заголовки (все строковые значения), выделяем их
  const firstRow = data[0];
  const hasHeaders = firstRow && firstRow.every((cell) => typeof cell === "string" || cell === null);
  
  return {
    sheet,
    range: `${from}:${to}`,
    data,
    headers: hasHeaders ? (firstRow as string[]) : undefined,
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
  worksheet[cell] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
  };
  
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
  
  saveWorkbook(workbook);
}

/**
 * Получает формулу из ячейки
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
  
  // Если ячейка содержит формулу
  if (cellData.f) {
    return cellData.f;
  }
  
  return null;
}

/**
 * Получает список всех листов
 */
export function getSheets(): string[] {
  const workbook = loadWorkbook();
  return workbook.SheetNames;
}

