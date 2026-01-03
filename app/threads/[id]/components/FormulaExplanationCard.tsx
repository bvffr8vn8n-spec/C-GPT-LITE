"use client";

import { useState } from "react";

interface FormulaExplanationOutput {
  cell: string;
  formula: string | null;
  dependsOn: string[];
  values: Record<string, string | number | boolean | null | Array<string | number | boolean | null>>;
  computed: string | number | null;
  explanation: string;
  supported: boolean;
  warnings: string[];
}

interface Props {
  part: {
    output?: FormulaExplanationOutput;
    result?: FormulaExplanationOutput;
  };
}

export default function FormulaExplanationCard({ part }: Props) {
  const output = part.output || part.result;
  if (!output) return null;

  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      style={{
        marginTop: 12,
        padding: "16px",
        borderRadius: 12,
        border: "1px solid rgba(100,150,255,0.3)",
        background: "rgba(100,150,255,0.1)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#ffffff" }}>
        🔢 Формула: {output.cell}
      </div>

      {output.formula ? (
        <>
          <div style={{ fontSize: 13, marginBottom: 8, color: "rgba(255,255,255,0.9)", fontFamily: "monospace" }}>
            <strong>Формула:</strong> {output.formula}
          </div>

          {output.dependsOn.length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 8, color: "rgba(255,255,255,0.8)" }}>
              <strong>Зависит от:</strong> {output.dependsOn.join(", ")}
            </div>
          )}

          {output.computed !== null ? (
            <div style={{ fontSize: 13, marginBottom: 8, color: "rgba(100,255,100,0.9)" }}>
              <strong>Вычислено:</strong> {String(output.computed)}
            </div>
          ) : (
            <div style={{ fontSize: 13, marginBottom: 8, color: "rgba(255,200,100,0.9)" }}>
              <strong>Не вычислено</strong> {!output.supported && "(не поддерживается)"}
            </div>
          )}

          {output.warnings.length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 8, color: "rgba(255,150,100,0.9)" }}>
              <strong>Предупреждения:</strong>
              <ul style={{ margin: "4px 0 0 20px", padding: 0 }}>
                {output.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 12, marginBottom: 8, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            {output.explanation}
          </div>

          {output.dependsOn.length > 0 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid rgba(100,150,255,0.5)",
                background: "rgba(100,150,255,0.2)",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                marginTop: 8,
              }}
            >
              {showDetails ? "Скрыть детали" : "Показать детали значений"}
            </button>
          )}

          {showDetails && output.dependsOn.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "12px",
                borderRadius: 8,
                background: "rgba(0,0,0,0.2)",
                fontSize: 11,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Значения зависимостей:</div>
              {output.dependsOn.map((dep) => {
                const value = output.values[dep];
                return (
                  <div key={dep} style={{ marginBottom: 6 }}>
                    <strong>{dep}:</strong>{" "}
                    {Array.isArray(value) ? (
                      <span style={{ fontFamily: "monospace" }}>[{value.join(", ")}]</span>
                    ) : (
                      <span style={{ fontFamily: "monospace" }}>{String(value ?? "null")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {output.explanation}
        </div>
      )}
    </div>
  );
}

