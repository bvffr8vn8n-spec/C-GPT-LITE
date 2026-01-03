"use client";

import { useState } from "react";
import TableModal from "./TableModal";

interface TableData {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
  formulas?: Array<Array<string | null>>; // Матрица формул
}

interface Props {
  tableData: TableData;
  onRangeSelect?: (range: string) => void;
}

export default function TableMessage({ tableData, onRangeSelect }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Преобразуем данные в формат для модального окна
  const tableRows = tableData.data || [];
  const hasHeaders = tableData.headers && tableData.headers.length > 0;
  const displayRows = hasHeaders && tableRows.length > 0 ? tableRows.slice(1) : tableRows;
  const headers = hasHeaders 
    ? tableData.headers! 
    : (tableRows[0]?.map((_, i) => String.fromCharCode(65 + i)) || []);

  return (
    <>
      <div
        style={{
          marginTop: 12,
          padding: "16px",
          borderRadius: 12,
          border: isHovered 
            ? "1px solid rgba(100,150,255,0.5)" 
            : "1px solid rgba(100,150,255,0.3)",
          background: isHovered 
            ? "rgba(100,150,255,0.15)" 
            : "rgba(100,150,255,0.1)",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onClick={() => setShowModal(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          📊 <b>Таблица: {tableData.sheet}!{tableData.range}</b>
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
          Нажмите, чтобы открыть в модальном окне
        </div>
        
        {/* Мини-превью таблицы */}
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                {headers.slice(0, 5).map((header, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.05)",
                      textAlign: "left",
                      fontWeight: 600,
                    }}
                  >
                    {header}
                  </th>
                ))}
                {headers.length > 5 && (
                  <th
                    style={{
                      padding: "4px 8px",
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.05)",
                      textAlign: "center",
                    }}
                  >
                    ...
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.slice(0, 3).map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.slice(0, 5).map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {cell ?? ""}
                    </td>
                  ))}
                  {row.length > 5 && (
                    <td
                      style={{
                        padding: "4px 8px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        textAlign: "center",
                      }}
                    >
                      ...
                    </td>
                  )}
                </tr>
              ))}
              {displayRows.length > 3 && (
                <tr>
                  <td
                    colSpan={Math.min(headers.length, 6)}
                    style={{
                      padding: "4px 8px",
                      textAlign: "center",
                      opacity: 0.6,
                      fontSize: 11,
                    }}
                  >
                    ... ещё {displayRows.length - 3} строк
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <TableModal
          tableData={tableData}
          onClose={() => setShowModal(false)}
          onRangeSelect={onRangeSelect}
          onEditCell={async (sheet, cell, value) => {
            // Локальное подтверждение для UI-редактирования
            const confirmed = window.confirm(
              `Изменить ячейку ${sheet}!${cell} на значение: ${value}?`
            );
            
            if (!confirmed) {
              return;
            }

            try {
              // Вызываем API для обновления ячейки
              const response = await fetch("/api/xlsx/perform", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "updateXlsxCell",
                  targetId: cell,
                  newContent: sheet,
                  xlsxValue: value,
                }),
              });

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }

              const result = await response.json();

              if (!result.ok) {
                throw new Error(result.error || "Ошибка обновления ячейки");
              }

              // Обновляем таблицу через getRange
              // Примечание: обновление данных таблицы должно происходить через родительский компонент
              // Здесь просто закрываем модалку, данные обновятся при следующем рендере
              const rangeMatch = tableData.range.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
              if (rangeMatch) {
                // Данные обновятся автоматически при следующем запросе getRange
                // Модалка закроется, и пользователь увидит обновлённые данные
              }
            } catch (error) {
              console.error("❌ [TableMessage] Ошибка при обновлении ячейки:", error);
              alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
        />
      )}
    </>
  );
}

