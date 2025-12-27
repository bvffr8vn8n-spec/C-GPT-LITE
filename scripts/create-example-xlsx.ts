import * as XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const XLSX_FILE_PATH = resolve(process.cwd(), "data", "example.xlsx");

// Создаём директорию, если её нет
mkdirSync(dirname(XLSX_FILE_PATH), { recursive: true });

// Создаём workbook
const workbook = XLSX.utils.book_new();

// Создаём данные для таблицы
const data = [
  ["Email", "Имя", "Сумма", "Формула"],
  ["ivan@example.com", "Иван", 1000, "=C2*1.2"],
  ["maria@example.com", "Мария", 2000, "=C3*1.2"],
  ["petr@example.com", "Пётр", 1500, "=C4*1.2"],
  ["anna@example.com", "Анна", 3000, "=C5*1.2"],
  ["Итого", "", "=SUM(C2:C5)", "=SUM(D2:D5)"],
];

// Создаём worksheet
const worksheet = XLSX.utils.aoa_to_sheet(data);

// Добавляем worksheet в workbook
XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

// Сохраняем файл
const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
writeFileSync(XLSX_FILE_PATH, buffer);

console.log(`✅ Created example XLSX file at: ${XLSX_FILE_PATH}`);

