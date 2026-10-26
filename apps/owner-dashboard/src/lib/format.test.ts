import { describe, expect, it } from "vitest";
import { formatINR } from "./format";

describe("formatINR", () => {
  it("formats lakh grouping correctly", () => {
    expect(formatINR(123456.5)).toBe("₹1,23,456.50");
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(-150)).toBe("-₹150.00");
  });
});
