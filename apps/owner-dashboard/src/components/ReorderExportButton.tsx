"use client";

import React, { useState } from "react";
import { Download } from "lucide-react";

export interface ReorderItem {
  item_code: string;
  warehouse: string;
  actual_qty: number;
  reorder_level: number;
  reorder_qty: number;
}

interface ReorderExportButtonProps {
  items: ReorderItem[];
  filenamePrefix?: string;
}

export function ReorderExportButton({
  items,
  filenamePrefix = "reorder_replenishment_list",
}: ReorderExportButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleExport = () => {
    if (items.length === 0) {
      alert("No out-of-stock or low-stock items to export.");
      return;
    }

    setDownloading(true);

    const headers = [
      "Item Code",
      "Warehouse",
      "Current Stock",
      "Reorder Level",
      "Suggested Order Qty",
    ];

    const rows = items.map((item) => {
      const suggestedQty =
        item.reorder_qty > 0
          ? item.reorder_qty
          : Math.max(1, item.reorder_level - item.actual_qty);

      return [
        `"${item.item_code.replace(/"/g, '""')}"`,
        `"${item.warehouse.replace(/"/g, '""')}"`,
        item.actual_qty,
        item.reorder_level,
        suggestedQty,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `${filenamePrefix}_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setTimeout(() => setDownloading(false), 800);
  };

  return (
    <button
      type="button"
      className="btn"
      onClick={handleExport}
      disabled={downloading || items.length === 0}
      title={
        items.length === 0
          ? "No items currently below reorder levels"
          : `Export ${items.length} items to CSV for distributor purchase orders`
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "var(--card)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        padding: "6px 14px",
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--fs-sm)",
        fontWeight: 600,
        cursor: items.length === 0 ? "not-allowed" : "pointer",
        opacity: items.length === 0 ? 0.6 : 1,
      }}
    >
      <Download size={14} aria-hidden="true" />
      <span>{downloading ? "Exporting…" : `Export Reorder List (${items.length})`}</span>
    </button>
  );
}
