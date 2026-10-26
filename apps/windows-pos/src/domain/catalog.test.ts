import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@departmental/shared-types";
import { findByBarcode, searchCatalog } from "./catalog";

function item(
  code: string,
  name: string,
  opts: { aliases?: string[]; barcodes?: string[]; price?: number | null } = {},
): CatalogItem {
  return {
    item_code: code,
    item_name: name,
    stock_uom: "Nos",
    is_stock_item: true,
    has_batch_no: false,
    aliases: opts.aliases ?? [],
    barcodes: (opts.barcodes ?? []).map((barcode) => ({ barcode, barcode_type: "EAN" })),
    price: opts.price === undefined ? { price_list_rate: 10 } : opts.price === null ? null : { price_list_rate: opts.price },
    modified: "2026-10-26 00:00:00",
  };
}

const catalog = [
  item("COLGATE-200", "Colgate Toothpaste 200g", {
    aliases: ["colgate", "toothpaste"],
    barcodes: ["8901234567890"],
    price: 99,
  }),
  item("RICE-5KG", "Basmati Rice 5kg", { aliases: ["rice", "chawal"], price: 450 }),
  item("DETERGENT", "Surf Excel Detergent", { price: 210 }),
  item("NOSALE", "Display Only Item", { price: null }),
];

describe("findByBarcode", () => {
  it("finds by exact barcode", () => {
    expect(findByBarcode(catalog, "8901234567890")?.item_code).toBe("COLGATE-200");
  });

  it("returns null for unknown and empty codes", () => {
    expect(findByBarcode(catalog, "999")).toBeNull();
    expect(findByBarcode(catalog, "  ")).toBeNull();
  });
});

describe("searchCatalog", () => {
  it("ranks exact alias above partial name match", () => {
    const hits = searchCatalog(catalog, "colgate");
    expect(hits[0]?.item.item_code).toBe("COLGATE-200");
    expect(hits[0]?.matchedBy).toBe("alias");
  });

  it("supports hindi/vernacular aliases", () => {
    const hits = searchCatalog(catalog, "chawal");
    expect(hits[0]?.item.item_code).toBe("RICE-5KG");
  });

  it("matches multi-token names", () => {
    const hits = searchCatalog(catalog, "basmati rice");
    expect(hits[0]?.item.item_code).toBe("RICE-5KG");
  });

  it("matches item code", () => {
    const hits = searchCatalog(catalog, "DETERGENT");
    expect(hits[0]?.matchedBy).toBe("item_code");
  });

  it("returns empty for empty query", () => {
    expect(searchCatalog(catalog, "")).toEqual([]);
  });

  it("is deterministic on ties", () => {
    const hits = searchCatalog(catalog, "item");
    for (let i = 1; i < hits.length; i++) {
      const prev = hits[i - 1]!;
      const cur = hits[i]!;
      if (prev.score === cur.score) {
        expect(prev.item.item_code <= cur.item.item_code).toBe(true);
      }
    }
  });
});
