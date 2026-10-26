import { describe, expect, it } from "vitest";
import { buildTsplLabel, buildZplLabel, type LabelData } from "./labels";

const base: LabelData = {
  itemName: "Colgate Toothpaste 200g",
  itemCode: "COLGATE-200",
  barcode: "8901234000019",
  priceMinor: 9900,
  currency: "INR",
  netQuantity: "200 g",
  mrpMinor: 11000,
};

describe("ZPL label builder", () => {
  it("frames the format and includes barcode as Code 128", () => {
    const text = new TextDecoder().decode(buildZplLabel(base));
    expect(text.startsWith("^XA")).toBe(true);
    expect(text.trimEnd().endsWith("^XZ")).toBe(true);
    expect(text).toContain("^BCN,64,Y,N,N^FD8901234000019^FS");
    expect(text).toContain("Colgate Toothpaste 200g");
    expect(text).toContain("₹99.00 MRP ₹110.00");
    expect(text).toContain("200 g");
  });

  it("sanitizes format-control characters from data", () => {
    const text = new TextDecoder().decode(
      buildZplLabel({ ...base, itemName: "Bad^FD~SD25^XA\x01name" }),
    );
    expect(text).not.toContain("Bad^FD");
    expect(text).not.toContain("~SD25");
    expect(text).toContain("Bad-FD-SD25-XAname");
  });

  it("includes batch and expiry when present", () => {
    const text = new TextDecoder().decode(
      buildZplLabel({ ...base, batchNo: "MILK-BATCH-001", expiryDate: "2026-11-30" }),
    );
    expect(text).toContain("B: MILK-BATCH-001");
    expect(text).toContain("Exp: 2026-11-30");
  });
});

describe("TSPL label builder", () => {
  it("frames the job and includes barcode + price", () => {
    const text = new TextDecoder().decode(buildTsplLabel(base));
    expect(text.startsWith("SIZE 50 mm,25 mm")).toBe(true);
    expect(text.trimEnd().endsWith("PRINT 1,1")).toBe(true);
    expect(text).toContain("BARCODE 20,84,\"128\",48,1,0,2,2,\"8901234000019\"");
    expect(text).toContain("₹99.00");
  });

  it("sanitizes control characters and quote-safe data", () => {
    const text = new TextDecoder().decode(
      buildTsplLabel({ ...base, itemCode: "SKU\x02^XA~JA" }),
    );
    expect(text).not.toContain("^XA");
    expect(text).toContain("SKU-XA-JA");
  });
});
