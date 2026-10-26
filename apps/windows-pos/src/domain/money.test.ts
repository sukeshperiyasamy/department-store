import { describe, expect, it } from "vitest";
import {
  addMoney,
  formatMoney,
  fromMajorUnits,
  money,
  multiplyMoney,
  serverAmountToMoney,
  toMajorUnits,
} from "./money";

describe("money", () => {
  it("stores minor units as integers", () => {
    expect(fromMajorUnits(12.5).minor).toBe(1250);
    expect(toMajorUnits(money(1250))).toBe(12.5);
  });

  it("refuses non-integer minor units", () => {
    expect(() => money(1.5)).toThrow();
  });

  it("adds and multiplies safely", () => {
    expect(addMoney(money(100), money(250)).minor).toBe(350);
    expect(multiplyMoney(money(555), 3).minor).toBe(1665);
    expect(multiplyMoney(money(1), 0.5).minor).toBe(1); // rounds to 0.5 -> 1
  });

  it("rejects currency mixing", () => {
    expect(() => addMoney(money(1, "INR"), money(1, "USD"))).toThrow(/currency mismatch/);
  });

  it("formats INR", () => {
    expect(formatMoney(fromMajorUnits(0))).toBe("₹0.00");
    expect(formatMoney(fromMajorUnits(1234.56))).toBe("₹1,234.56");
    expect(formatMoney(fromMajorUnits(-9.05))).toBe("-₹9.05");
  });

  it("converts server decimal amounts", () => {
    expect(serverAmountToMoney(10.005, "INR").minor).toBe(1001); // rounds half up
    expect(serverAmountToMoney(0.1 + 0.2, "INR").minor).toBe(30);
  });
});
