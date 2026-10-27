import React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ReorderExportButton, type ReorderItem } from "./ReorderExportButton";

describe("ReorderExportButton component", () => {
  it("renders disabled state when items list is empty", () => {
    const html = renderToString(<ReorderExportButton items={[]} />);
    expect(html).toContain("Export Reorder List (0)");
    expect(html).toContain("disabled");
  });

  it("renders active button with item count when replenishment items exist", () => {
    const mockItems: ReorderItem[] = [
      {
        item_code: "SKU-TOOTHPASTE-100G",
        warehouse: "Stores - DS",
        actual_qty: 0,
        reorder_level: 15,
        reorder_qty: 25,
      },
      {
        item_code: "SKU-SOAP-75G",
        warehouse: "Stores - DS",
        actual_qty: 3,
        reorder_level: 20,
        reorder_qty: 40,
      },
    ];
    const html = renderToString(<ReorderExportButton items={mockItems} />);
    expect(html).toContain("Export Reorder List (2)");
    expect(html).not.toContain("disabled");
  });
});
