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

