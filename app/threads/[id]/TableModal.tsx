"use client";

import { useState, useEffect } from "react";
import SpreadsheetView from "./SpreadsheetView";

interface TableData {
  sheet: string;
  range: string;
  data: Array<Array<string | number | null>>;
  headers?: string[];
  formulas?: Array<Array<string | null>>; // Матрица формул
}

interface Props {
  tableData: TableData;
  onClose: () => void;
  onRangeSelect?: (range: string) => void;
  onEditCell?: (sheet: string, cell: string, value: string | number) => void;
}

export default function TableModal({ tableData, onRangeSelect, onClose, onEditCell }: Props) {
  const [localTableData, setLocalTableData] = useState<TableData>(tableData);

  // Обновляем локальные данные при изменении пропсов
  useEffect(() => {
    setLocalTableData(tableData);
  }, [tableData]);

  // Обработчик редактирования ячейки
  const handleEditCell = async (sheet: string, cell: string, value: string | number) => {
    if (onEditCell) {
      await onEditCell(sheet, cell, value);
      // Обновляем локальные данные после редактирования
      // (onEditCell должен обновить таблицу через API и вернуть обновлённые данные)
      const rangeMatch = localTableData.range.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
      if (rangeMatch) {
        try {
          const rangeResponse = await fetch(
            `/api/xlsx/range?sheet=${sheet}&from=${rangeMatch[1]}&to=${rangeMatch[2]}`
          );
          if (rangeResponse.ok) {
            const rangeData = await rangeResponse.json();
            setLocalTableData({
              sheet: rangeData.sheet,
              range: rangeData.range,
              data: rangeData.data,
              headers: rangeData.headers,
              formulas: rangeData.formulas, // Обновляем формулы
            });
          }
        } catch (error) {
          console.error("❌ [TableModal] Ошибка при обновлении таблицы:", error);
        }
      }
    }
  };

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
              📊 {localTableData.sheet}!{localTableData.range}
            </h2>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Выделите диапазон и нажмите "Вставить диапазон" для вставки в чат
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
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
          <SpreadsheetView
            sheet={localTableData.sheet}
            range={localTableData.range}
            data={localTableData.data}
            headers={localTableData.headers}
            formulas={localTableData.formulas}
            onEditCell={handleEditCell}
            onRangeSelect={(mention) => {
              if (onRangeSelect) {
                onRangeSelect(mention);
                onClose();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
