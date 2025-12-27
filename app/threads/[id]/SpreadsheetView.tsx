"use client";

import { useState } from "react";
import * as React from "react";

interface Props {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
  onEditCell: (sheet: string, cell: string, value: string | number) => void;
  onRangeSelect?: (range: string) => void; // ШАГ 4: Callback для вставки меншона
}

// Конвертируем координаты в адрес ячейки (A1, B2, etc.)
function getCellAddress(row: number, col: number, hasHeaders: boolean | undefined): string {
  const colStr = String.fromCharCode(65 + col);
  // Если есть headers, первая строка данных = row 1, иначе row 0
  const rowNum = hasHeaders ? row + 2 : row + 1;
  return `${colStr}${rowNum}`;
}

export default function SpreadsheetView({ sheet, range, data, headers, onEditCell, onRangeSelect }: Props) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);

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

  // ШАГ 4: Формирование меншона из выделенных ячеек
  const getSelectedRange = (): string | null => {
    if (selectedCells.size === 0) return null;
    const cells = Array.from(selectedCells)
      .map((key) => {
        const [row, col] = key.split(",").map(Number);
        const colStr = String.fromCharCode(65 + col);
        const rowNum = hasHeaders ? row + 2 : row + 1;
        return { row, col, address: `${colStr}${rowNum}` };
      })
      .sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
    if (cells.length === 0) return null;
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (cells.length === 1) {
      return `${sheet}!${first.address}`;
    }
    return `${sheet}!${first.address}:${last.address}`;
  };

  const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    // Если Shift не зажат, начинаем новое выделение
    if (!e.shiftKey) {
      e.preventDefault();
      setIsSelecting(true);
      setSelectionStart({ row, col });
      setSelectedCells(new Set([`${row},${col}`]));
    }
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isSelecting || !selectionStart) return;
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
    // Если не выделяем диапазон, открываем редактирование
    if (!isSelecting && selectedCells.size === 0) {
      const cellValue = displayRows[row]?.[col];
      setEditingCell({ row, col });
      setEditValue(cellValue != null ? String(cellValue) : "");
    }
  };

  // Обработка mouseup для завершения выделения
  React.useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
      setSelectionStart(null);
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleSave = () => {
    if (editingCell) {
      const cellAddress = getCellAddress(editingCell.row, editingCell.col, hasHeaders);
      const value = editValue.trim() === "" ? "" : (isNaN(Number(editValue)) ? editValue : Number(editValue));
      onEditCell(sheet, cellAddress, value);
      setEditingCell(null);
      setEditValue("");
    }
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const selectedRange = getSelectedRange();

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          📊 <b>{sheet}!{range}</b>
        </div>
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
              color: "inherit",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Вставить {selectedRange}
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto", maxHeight: "600px", overflowY: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              {displayHeaders.map((header, idx) => (
                <th
                  key={idx}
                  style={{
                    padding: "6px 8px",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    textAlign: "left",
                    fontWeight: 600,
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
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
                  return (
                    <td
                      key={colIdx}
                      onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                      onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                      onClick={(e) => handleCellClick(rowIdx, colIdx, e)}
                      style={{
                        padding: "6px 8px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: isEditing
                          ? "rgba(100,150,255,0.2)"
                          : selectedCells.has(`${rowIdx},${colIdx}`)
                          ? "rgba(100,150,255,0.3)"
                          : "transparent",
                        cursor: "pointer",
                        minWidth: "80px",
                        userSelect: "none",
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
                            padding: "4px",
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(100,150,255,0.5)",
                            borderRadius: 4,
                            color: "inherit",
                            fontSize: 12,
                          }}
                        />
                      ) : (
                        <span>{cell ?? ""}</span>
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

