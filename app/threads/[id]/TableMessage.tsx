"use client";

import { useState } from "react";
import TableModal from "./TableModal";

interface TableData {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
}

interface Props {
  tableData: TableData;
  onRangeSelect?: (range: string) => void;
}

export default function TableMessage({ tableData, onRangeSelect }: Props) {
  const [showModal, setShowModal] = useState(false);

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
          border: "1px solid rgba(100,150,255,0.3)",
          background: "rgba(100,150,255,0.1)",
          cursor: "pointer",
        }}
        onClick={() => setShowModal(true)}
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
        />
      )}
    </>
  );
}

