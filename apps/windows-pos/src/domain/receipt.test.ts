import { describe, expect, it } from "vitest";
import { buildEscPosReceipt, buildReceiptText, type ReceiptData } from "./receipt";

const baseData: ReceiptData = {
  storeName: "Sri Stores",
  counterName: "Counter 1",
  cashier: "cashier@store",
  invoiceName: "SINV-0001",
  transactionId: "11111111-2222-4333-8444-555555555555",
  lines: [
    { itemName: "Colgate Toothpaste 200g", qty: 2, uom: "Nos", rateMinor: 9900, amountMinor: 19800 },
    { itemName: "Basmati Rice 5kg", qty: 1, uom: "Nos", rateMinor: 45000, amountMinor: 45000 },
  ],
  payments: [{ modeOfPayment: "Cash", amountMinor: 65000 }],
  subtotalMinor: 64800,
  taxMinor: 0,
  totalMinor: 64800,
  changeMinor: 200,
  currency: "INR",
  occurredAt: "2026-10-26T10:00:00",
};

describe("receipt", () => {
  it("produces ESC/POS bytes with init and cut commands", () => {
    const bytes = buildEscPosReceipt(baseData);
    expect(bytes[0]).toBe(0x1b); // ESC
    expect(bytes[1]).toBe(0x40); // @ initialize
    // GS V B 0 = full cut near the end
    const tail = [...bytes.slice(-4)];
    expect(tail).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("includes store name, totals and transaction id", () => {
    const text = buildReceiptText(baseData);
    expect(text).toContain("Sri Stores");
    expect(text).toContain("TOTAL");
    expect(text).toContain("₹648.00");
    expect(text).toContain(baseData.transactionId);
    expect(text).toContain("SINV-0001");
  });

  it("marks duplicate reprints", () => {
    const original = buildReceiptText(baseData);
    const duplicate = buildReceiptText({ ...baseData, duplicate: true });
    expect(original).not.toContain("DUPLICATE");
    expect(duplicate).toContain("*** DUPLICATE COPY ***");
  });

  it("shows pending-sync bills without an invoice name", () => {
    const { invoiceName: _omit, ...data } = baseData;
    const text = buildReceiptText(data);
    expect(text).toContain("(pending sync)");
  });

  it("prints payment references when present", () => {
    const text = buildReceiptText({
      ...baseData,
      payments: [{ modeOfPayment: "UPI", amountMinor: 64800, referenceNo: "UPI/REF/99" }],
    });
    expect(text).toContain("UPI");
    expect(text).toContain("UPI/REF/99");
  });

  it("keeps amounts right-aligned in a fixed-width column", () => {
    const text = buildReceiptText(baseData);
    for (const lineText of text.split("\n")) {
      if (lineText.includes("TOTAL")) {
        expect(lineText.trimEnd().endsWith("₹648.00")).toBe(true);
      }
    }
  });
});
