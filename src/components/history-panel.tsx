"use client";

import type { ReactNode } from "react";

export type HistoryColumn<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
};

type HistoryPanelProps<T extends Record<string, unknown>> = {
  title: string;
  columns: HistoryColumn<T>[];
  rows: T[];
  emptyMessage?: string;
};

export function HistoryPanel<T extends Record<string, unknown>>({
  title,
  columns,
  rows,
  emptyMessage = "No records.",
}: HistoryPanelProps<T>) {
  return (
    <div className="panel">
      <h2 className="section-title" style={{ marginTop: 0 }}>
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="muted">{emptyMessage}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.id ?? i)}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
