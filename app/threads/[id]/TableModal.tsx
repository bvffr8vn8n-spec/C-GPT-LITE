"use client";

import { useState, useRef, useEffect } from "react";

interface TableData {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
}

interface Props {
  tableData: TableData;
  onClose: () => void;
  onRangeSelect?: (range: string) => void;
}

interface SelectedCell {
  row: number;
  col: number;
}

export default function TableModal({ tableData, onRangeSelect, onClose }: Props) {
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<SelectedCell | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const tableRows = tableData.data;
  const hasHeaders = tableData.headers && tableData.headers.length > 0;
  const displayRows = hasHeaders ? tableRows.slice(1) : tableRows;
  const headers = hasHeaders ? tableData.headers! : tableRows[0]?.map((_, i) => String.fromCharCode(65 + i)) || [];

  // Конвертируем координаты в адрес ячейки (A1, B2, etc.)
  function getCellAddress(row: number, col: number): string {
    const colStr = String.fromCharCode(65 + col);
    const rowNum = row + 1;
    return `${colStr}${rowNum}`;
  }

  // Парсим диапазон из selectedCells
  function getSelectedRange(): string | null {
    if (selectedCells.size === 0) return null;

    const cells = Array.from(selectedCells)
      .map((key) => {
        const [row, col] = key.split(",").map(Number);
        return { row, col, address: getCellAddress(row, col) };
      })
      .sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });

    if (cells.length === 0) return null;

    const first = cells[0];
    const last = cells[cells.length - 1];

    if (cells.length === 1) {
      return `${tableData.sheet}!${first.address}`;
    }

    return `${tableData.sheet}!${first.address}:${last.address}`;
  }

  function handleCellMouseDown(row: number, col: number, e: React.MouseEvent) {
    e.preventDefault();
    setIsSelecting(true);
    setSelectionStart({ row, col });
    setSelectedCells(new Set([`${row},${col}`]));
  }

  function handleCellMouseEnter(row: number, col: number) {
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
  }

  function handleMouseUp() {
    setIsSelecting(false);
    setSelectionStart(null);
  }

  function handleInsertMention() {
    const range = getSelectedRange();
    if (range && onRangeSelect) {
      onRangeSelect(range);
      onClose();
    }
  }

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const selectedRange = getSelectedRange();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "#1a1a1a",
          borderRadius: 12,
          padding: "24px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          overflow: "auto",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              📊 {tableData.sheet}!{tableData.range}
            </h2>
            {selectedRange && (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Выбрано: {selectedRange}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {selectedRange && onRangeSelect && (
              <button
                onClick={handleInsertMention}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(100,150,255,0.5)",
                  background: "rgba(100,150,255,0.2)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Вставить {selectedRange}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "inherit",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Закрыть
            </button>
          </div>
        </div>

        <div style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table
            ref={tableRef}
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: "8px 12px",
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
                    const cellKey = `${rowIdx},${colIdx}`;
                    const isSelected = selectedCells.has(cellKey);
                    return (
                      <td
                        key={colIdx}
                        onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          background: isSelected
                            ? "rgba(100,150,255,0.3)"
                            : "transparent",
                          cursor: "cell",
                          userSelect: "none",
                        }}
                      >
                        {cell ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

