"use client";

import { useState } from "react";
import * as React from "react";

interface Props {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
  formulas?: Array<Array<string | null>>; // Матрица формул (null если ячейка не содержит формулу)
  onEditCell: (sheet: string, cell: string, value: string | number) => void;
  onRangeSelect?: (range: string) => void; // ШАГ 4: Callback для вставки меншона
}

// Конвертируем координаты в адрес ячейки (A1, B2, AA1, etc.)
// row - индекс в displayRows (0-based)
// Если hasHeaders: displayRows[0] = data[1] = Excel строка 2 (rowNum=2)
// Если нет headers: displayRows[0] = data[0] = Excel строка 1 (rowNum=1)
function getCellAddress(row: number, col: number, hasHeaders: boolean | undefined): string {
  // Конвертируем колонку в букву (A=0, B=1, ..., Z=25, AA=26, AB=27, ...)
  let colStr = "";
  let colNum = col;
  while (colNum >= 0) {
    colStr = String.fromCharCode(65 + (colNum % 26)) + colStr;
    colNum = Math.floor(colNum / 26) - 1;
  }
  
  // Вычисляем номер строки в Excel
  // Если hasHeaders: displayRows[row] = data[row+1], значит Excel rowNum = row + 2
  // Если нет headers: displayRows[row] = data[row], значит Excel rowNum = row + 1
  const rowNum = hasHeaders ? row + 2 : row + 1;
  return `${colStr}${rowNum}`;
}

// Нормализует диапазон: возвращает { from, to } где from <= to (лексикографически)
function normalizeRange(from: string, to: string): { from: string; to: string } {
  // Парсим адреса ячеек (например "A1" -> {col: 0, row: 1})
  const parseCell = (addr: string): { col: number; row: number } => {
    const match = addr.match(/^([A-Z]+)(\d+)$/);
    if (!match) throw new Error(`Invalid cell address: ${addr}`);
    const colStr = match[1];
    const row = parseInt(match[2], 10);
    
    // Конвертируем буквы колонки в число (A=0, B=1, ..., Z=25, AA=26, ...)
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    col -= 1; // A=1 в Excel, но нам нужно 0-based
    
    return { col, row };
  };
  
  const fromParsed = parseCell(from);
  const toParsed = parseCell(to);
  
  // Сравниваем: сначала по строке, потом по колонке
  if (fromParsed.row < toParsed.row || (fromParsed.row === toParsed.row && fromParsed.col <= toParsed.col)) {
    return { from, to };
  } else {
    return { from: to, to: from };
  }
}

export default function SpreadsheetView({ sheet, range, data, headers, formulas, onEditCell, onRangeSelect }: Props) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [anchorCell, setAnchorCell] = useState<{ row: number; col: number } | null>(null); // Ячейка-якорь для Shift+Click
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null); // Активная ячейка
  const mouseMovedRef = React.useRef(false); // Ref для отслеживания движения мыши (чтобы не терять значение в onClick)
  const wasDraggingRef = React.useRef(false); // Ref для отслеживания того, что был drag (чтобы onClick не сбрасывал выделение)
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickCell, setLastClickCell] = useState<{ row: number; col: number } | null>(null);
  const [showFormulas, setShowFormulas] = useState(false); // Режим отображения: false = значения, true = формулы

  // Обработка пустого диапазона
  if (!data || data.length === 0 || (data.length === 1 && data[0]?.every((cell) => cell === null || cell === ""))) {
    return (
      <div
        style={{
          marginTop: 16,
          padding: "16px",
          borderRadius: 12,
          border: "1px solid rgba(100,150,255,0.3)",
          background: "rgba(100,150,255,0.1)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
          📊 <b>{sheet}!{range}</b>
        </div>
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.6 }}>
          Пустой диапазон
        </div>
      </div>
    );
  }

  const hasHeaders = headers && headers.length > 0;
  const displayRows = hasHeaders ? data.slice(1) : data;
  const displayHeaders = hasHeaders ? headers! : data[0]?.map((_, i) => String.fromCharCode(65 + i)) || [];

  // Формирование меншона из выделенных ячеек с нормализацией диапазона
  const getSelectedRange = (): string | null => {
    if (selectedCells.size === 0) return null;
    
    // Конвертируем selectedCells в адреса ячеек
    const cells = Array.from(selectedCells)
      .map((key) => {
        const [row, col] = key.split(",").map(Number);
        return { row, col, address: getCellAddress(row, col, hasHeaders) };
      })
      .sort((a, b) => {
        // Сортируем: сначала по строке, потом по колонке
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
    
    if (cells.length === 0) return null;
    
    const first = cells[0];
    const last = cells[cells.length - 1];
    
    // Нормализуем диапазон
    const normalized = normalizeRange(first.address, last.address);
    
    if (cells.length === 1) {
      return `@${sheet}!${normalized.from}`;
    }
    return `@${sheet}!${normalized.from}:${normalized.to}`;
  };

  const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    // Если это правый клик или Ctrl/Cmd - не начинаем выделение
    if (e.button === 2 || e.ctrlKey || e.metaKey) {
      return;
    }
    
    // Предотвращаем выделение текста браузером
    e.preventDefault();
    
    // Сбрасываем флаги движения мыши
    mouseMovedRef.current = false;
    wasDraggingRef.current = false;
    
    // Если Shift зажат - расширяем существующее выделение от anchor cell
    if (e.shiftKey && anchorCell) {
      setIsSelecting(false);
      setActiveCell({ row, col });
      
      // Вычисляем прямоугольный диапазон от anchor до текущей ячейки
      const newSelection = new Set<string>();
      const startRow = Math.min(anchorCell.row, row);
      const endRow = Math.max(anchorCell.row, row);
      const startCol = Math.min(anchorCell.col, col);
      const endCol = Math.max(anchorCell.col, col);
      
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          newSelection.add(`${r},${c}`);
        }
      }
      setSelectedCells(newSelection);
    } else {
      // Начинаем новое выделение
      setIsSelecting(true);
      setSelectionStart({ row, col });
      setAnchorCell({ row, col }); // Устанавливаем anchor cell
      setActiveCell({ row, col });
      setSelectedCells(new Set([`${row},${col}`]));
    }
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isSelecting || !selectionStart) return;
    
    // Если мышь двигается - это drag, а не клик
    if (row !== selectionStart.row || col !== selectionStart.col) {
      mouseMovedRef.current = true;
      wasDraggingRef.current = true; // Помечаем, что был drag
    }
    
    // Обновляем active cell
    setActiveCell({ row, col });
    
    // Вычисляем прямоугольный диапазон от selectionStart до текущей ячейки
    const newSelection = new Set<string>();
    const startRow = Math.min(selectionStart.row, row);
    const endRow = Math.max(selectionStart.row, row);
    const startCol = Math.min(selectionStart.col, col);
    const endCol = Math.max(selectionStart.col, col);
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        newSelection.add(`${r},${c}`);
      }
    }
    setSelectedCells(newSelection);
  };

  const handleCellClick = (row: number, col: number, e: React.MouseEvent) => {
    const now = Date.now();
    const isDoubleClick = 
      lastClickCell?.row === row && 
      lastClickCell?.col === col && 
      (now - lastClickTime) < 300; // 300ms для double-click
    
    // Проверяем, находится ли ячейка в выделенном диапазоне
    const isInSelection = selectedCells.has(`${row},${col}`);
    
    // Если был drag (мышка двигалась) - НЕ обрабатываем клик, выделение уже установлено
    // НО если это двойной клик - обрабатываем его для редактирования
    if ((wasDraggingRef.current || mouseMovedRef.current || isSelecting) && !isDoubleClick) {
      // Завершаем выделение, но сохраняем его
      wasDraggingRef.current = false;
      mouseMovedRef.current = false;
      setIsSelecting(false);
      // Сохраняем anchor cell для будущих Shift+Click
      if (selectionStart) {
        setAnchorCell(selectionStart);
      }
      setSelectionStart(null);
      return;
    }
    
    if (isDoubleClick) {
      // Double-click: открываем редактирование выбранной ячейки
      // Сохраняем текущее выделение (не сбрасываем на одну ячейку)
      // Если ячейка содержит формулу, показываем формулу, иначе значение
      const hasHeaders = headers && headers.length > 0;
      const actualRow = hasHeaders ? row + 1 : row;
      const cellFormula = formulas?.[actualRow]?.[col];
      const cellValue = displayRows[row]?.[col];
      
      setEditingCell({ row, col });
      // При редактировании всегда показываем формулу, если она есть, иначе значение
      // Если формула есть, добавляем = в начало, если его нет
      if (cellFormula != null) {
        const formulaWithEquals = cellFormula.startsWith("=") ? cellFormula : `=${cellFormula}`;
        setEditValue(formulaWithEquals);
      } else {
        setEditValue(cellValue != null ? String(cellValue) : "");
      }
      // НЕ сбрасываем selectedCells - сохраняем выделение диапазона
      setIsSelecting(false);
      setSelectionStart(null);
      mouseMovedRef.current = false;
      wasDraggingRef.current = false; // Сбрасываем флаг drag
      setLastClickTime(0);
      setLastClickCell(null);
      setActiveCell({ row, col }); // Обновляем активную ячейку на редактируемую
    } else {
      // Single click
      // Но только если НЕ было drag
      if (!wasDraggingRef.current && !mouseMovedRef.current) {
        setLastClickTime(now);
        setLastClickCell({ row, col });
        
        // Если кликнули на ячейку в уже выделенном диапазоне - не сбрасываем выделение, только обновляем activeCell
        if (isInSelection && selectedCells.size > 1) {
          // Ячейка уже в выделении - просто обновляем активную ячейку
          setActiveCell({ row, col });
        } else {
          // Ячейка не в выделении или выделена только одна - начинаем новое выделение
          setSelectedCells(new Set([`${row},${col}`]));
          setAnchorCell({ row, col }); // Устанавливаем anchor cell при клике
          setActiveCell({ row, col });
        }
        
        setIsSelecting(false);
        setSelectionStart(null);
        mouseMovedRef.current = false;
        wasDraggingRef.current = false;
      } else {
        // Если был drag, но это не двойной клик - просто сбрасываем флаги
        wasDraggingRef.current = false;
        mouseMovedRef.current = false;
      }
    }
  };

  // Обработка mouseup для завершения выделения
  React.useEffect(() => {
    const handleMouseUp = () => {
      // Завершаем выделение при mouseup
      if (isSelecting) {
        // Сохраняем anchor cell для будущих Shift+Click
        if (selectionStart) {
          setAnchorCell(selectionStart);
        }
        // НЕ очищаем selectionStart сразу - это нужно для проверки в onClick
        // Очистим через небольшую задержку
        setTimeout(() => {
          setIsSelecting(false);
          setSelectionStart(null);
          // Сбрасываем флаг drag только если он был установлен
          // (он может быть нужен для проверки в onClick)
        }, 100);
      }
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [isSelecting, selectionStart]);

  const handleSave = () => {
    if (editingCell) {
      const cellAddress = getCellAddress(editingCell.row, editingCell.col, hasHeaders);
      // Если значение начинается с =, это формула - сохраняем как строку
      // Иначе пытаемся преобразовать в число, если возможно
      let value: string | number;
      const trimmedValue = editValue.trim();
      if (trimmedValue === "") {
        value = "";
      } else if (trimmedValue.startsWith("=")) {
        // Это формула - сохраняем как строку
        value = trimmedValue;
      } else {
        // Пытаемся преобразовать в число
        const numValue = Number(trimmedValue);
        value = isNaN(numValue) ? trimmedValue : numValue;
      }
      onEditCell(sheet, cellAddress, value);
      setEditingCell(null);
      setEditValue("");
      // Выделение сохраняется после сохранения
    }
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Функция для перехода к следующей ячейке в выделенном диапазоне
  const moveToNextCellInSelection = () => {
    if (!editingCell || selectedCells.size <= 1) return;
    
    const cells = Array.from(selectedCells)
      .map((key) => {
        const [r, c] = key.split(",").map(Number);
        return { row: r, col: c };
      })
      .sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
    
    const currentIndex = cells.findIndex(
      (c) => c.row === editingCell.row && c.col === editingCell.col
    );
    
    if (currentIndex >= 0 && currentIndex < cells.length - 1) {
      // Переходим к следующей ячейке
      const nextCell = cells[currentIndex + 1];
      const cellValue = displayRows[nextCell.row]?.[nextCell.col];
      setEditingCell(nextCell);
      setEditValue(cellValue != null ? String(cellValue) : "");
      setActiveCell(nextCell);
    } else {
      // Дошли до конца - закрываем редактирование
      setEditingCell(null);
      setEditValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Enter - перейти к предыдущей ячейке (если нужно)
        handleSave();
      } else {
        // Enter - сохранить и перейти к следующей ячейке в диапазоне
        handleSave();
        // Небольшая задержка для сохранения, затем переход к следующей ячейке
        setTimeout(() => {
          moveToNextCellInSelection();
        }, 50);
      }
    } else if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab - перейти к предыдущей ячейке (если нужно)
        handleSave();
      } else {
        // Tab - сохранить и перейти к следующей ячейке
        handleSave();
        setTimeout(() => {
          moveToNextCellInSelection();
        }, 50);
      }
    }
  };

  const selectedRange = getSelectedRange();

  return (
    <div
      style={{
        marginTop: 16,
        padding: "20px",
        borderRadius: 12,
        border: "1px solid rgba(100,150,255,0.2)",
        background: "rgba(21, 27, 40, 0.8)", // Темно-синий фон как на скриншоте
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>
          📊 <b>{sheet}!{range}</b>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!editingCell && (
            <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontStyle: "italic" }}>
                💡 Кликните на ячейку для редактирования • Зажмите и перетащите для выбора диапазона • Enter для сохранения
              </div>
              {/* Переключатель режима "значения/формулы" */}
              <button
                onClick={() => setShowFormulas(!showFormulas)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(100,150,255,0.5)",
                  background: showFormulas ? "rgba(100,150,255,0.3)" : "rgba(100,150,255,0.1)",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
                title={showFormulas ? "Показать значения" : "Показать формулы"}
              >
                {showFormulas ? "📊 Значения" : "🔢 Формулы"}
              </button>
            </>
          )}
          {selectedRange && onRangeSelect && (
            <button
              onClick={() => {
                onRangeSelect(selectedRange);
                setSelectedCells(new Set()); // Очищаем выделение после вставки
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(100,150,255,0.5)",
                background: "rgba(100,150,255,0.2)",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Вставить {selectedRange}
            </button>
          )}
        </div>
      </div>
      <div style={{ overflowX: "auto", maxHeight: "600px", overflowY: "auto", borderRadius: 8 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 13,
            color: "#ffffff",
          }}
        >
          <thead>
            <tr>
              {displayHeaders.map((header, idx) => (
                <th
                  key={idx}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(100,150,255,0.15)",
                    textAlign: "left",
                    fontWeight: 600,
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    color: "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => {
                  const isEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx;
                  const isSelected = selectedCells.has(`${rowIdx},${colIdx}`);
                  return (
                    <td
                      key={colIdx}
                      onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                      onMouseEnter={(e) => {
                        // Вызываем handleCellMouseEnter для выделения
                        handleCellMouseEnter(rowIdx, colIdx);
                        // Hover эффект только если не редактируем и не выделено
                        if (!isEditing && !isSelected && !isSelecting) {
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                        }
                      }}
                      onClick={(e) => {
                        // Если ячейка уже в выделенном диапазоне и выделено больше одной ячейки - открываем редактирование сразу
                        if (isSelected && selectedCells.size > 1 && !isEditing) {
                          const cellValue = displayRows[rowIdx]?.[colIdx];
                          setEditingCell({ row: rowIdx, col: colIdx });
                          setEditValue(cellValue != null ? String(cellValue) : "");
                          setActiveCell({ row: rowIdx, col: colIdx });
                        } else {
                          // Обычная обработка клика
                          handleCellClick(rowIdx, colIdx, e);
                        }
                      }}
                      onKeyDown={(e) => {
                        // Если нажали Enter на выделенной ячейке (но не в режиме редактирования) - открываем редактирование
                        if (e.key === "Enter" && !isEditing && isSelected) {
                          e.preventDefault();
                          // Если ячейка содержит формулу, показываем формулу, иначе значение
                          const hasHeaders = headers && headers.length > 0;
                          const actualRow = hasHeaders ? rowIdx + 1 : rowIdx;
                          const cellFormula = formulas?.[actualRow]?.[colIdx];
                          const cellValue = displayRows[rowIdx]?.[colIdx];
                          
                          setEditingCell({ row: rowIdx, col: colIdx });
                          // Если формула есть, добавляем = в начало, если его нет
                          if (cellFormula != null) {
                            const formulaWithEquals = cellFormula.startsWith("=") ? cellFormula : `=${cellFormula}`;
                            setEditValue(formulaWithEquals);
                          } else {
                            setEditValue(cellValue != null ? String(cellValue) : "");
                          }
                          setActiveCell({ row: rowIdx, col: colIdx });
                        }
                      }}
                      tabIndex={isSelected ? 0 : -1} // Делаем выделенные ячейки фокусируемыми для клавиатуры
                      style={{
                        padding: "10px 12px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: isEditing
                          ? "rgba(100,150,255,0.25)"
                          : isSelected
                          ? "rgba(100,150,255,0.2)"
                          : "transparent",
                        cursor: "pointer",
                        minWidth: "100px",
                        userSelect: "none",
                        color: "#ffffff",
                        transition: "background 0.15s ease",
                        outline: isSelected && activeCell?.row === rowIdx && activeCell?.col === colIdx ? "2px solid rgba(100,150,255,0.6)" : "none",
                        outlineOffset: "-2px",
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditing && !isSelected) {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSave}
                          onKeyDown={handleKeyDown}
                          autoFocus
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            background: "rgba(255,255,255,0.15)",
                            border: "1px solid rgba(100,150,255,0.6)",
                            borderRadius: 4,
                            color: "#ffffff",
                            fontSize: 13,
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span style={{ color: "#ffffff" }}>
                          {(() => {
                            // Если режим "формулы" и есть формула - показываем формулу с =
                            if (showFormulas && formulas) {
                              const hasHeaders = headers && headers.length > 0;
                              const actualRow = hasHeaders ? rowIdx + 1 : rowIdx;
                              const cellFormula = formulas[actualRow]?.[colIdx];
                              if (cellFormula != null) {
                                // Добавляем = в начало, если его нет
                                return cellFormula.startsWith("=") ? cellFormula : `=${cellFormula}`;
                              }
                            }
                            // Иначе показываем значение
                            return cell ?? "";
                          })()}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

