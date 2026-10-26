/**
 * Money handling in integer minor units (paise for INR).
 * Display totals are estimates only — the server is authoritative for the
 * final invoice amounts (see AGENTS.md financial rules).
 */

export interface Money {
  /** Integer minor units (paise). Never a float. */
  readonly minor: number;
  readonly currency: string;
}

export function money(minor: number, currency = "INR"): Money {
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`money must be a safe integer, got ${minor}`);
  }
  return { minor, currency };
}

export function fromMajorUnits(major: number, currency = "INR"): Money {
  const minor = Math.round(major * 100);
  return money(minor, currency);
}

export function toMajorUnits(m: Money): number {
  return m.minor / 100;
}

export function addMoney(...amounts: Money[]): Money {
  if (amounts.length === 0) throw new Error("addMoney requires at least one amount");
  const currency = amounts[0]!.currency;
  for (const a of amounts) {
    if (a.currency !== currency) {
      throw new Error(`currency mismatch: ${a.currency} vs ${currency}`);
    }
  }
  return money(amounts.reduce((sum, a) => sum + a.minor, 0), currency);
}

export function multiplyMoney(m: Money, qty: number): Money {
  return money(Math.round(m.minor * qty), m.currency);
}

export function formatMoney(m: Money): string {
  const negative = m.minor < 0;
  const abs = Math.abs(m.minor);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const body = `${rupees.toLocaleString("en-IN")}.${String(paise).padStart(2, "0")}`;
  return `${negative ? "-" : ""}₹${body}`;
}

/** Fractional rupee strings like "12.5" from server payloads become minor units. */
export function serverAmountToMoney(amount: number, currency: string): Money {
  return money(Math.round(amount * 100), currency);
}
