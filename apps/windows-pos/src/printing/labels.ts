/**
 * Label builders for thermal label printers.
 *
 * - ZPL (Zebra Programming Language) — Zebra and many compatibles.
 * - TSPL (TSC sense) — TSC and various desktop label printers.
 *
 * Both are pure byte/string builders: unit-tested without hardware. Physical
 * printing must be verified on the actual device (docs/hardware/PRINTER_SETUP_AND_TESTING.md).
 * Labels carry the item name, SKU, barcode (Code 128 of the actual barcode —
 * never a fabricated identifier), MRP/selling price and net quantity.
 */

export interface LabelData {
  itemName: string;
  itemCode: string;
  /** The item's real barcode value (printed as Code 128). */
  barcode: string;
  priceMinor: number;
  currency: string;
  /** Net quantity as sold, e.g. "200 g", "5 kg", "1 pc". */
  netQuantity: string;
  mrpMinor?: number;
  batchNo?: string;
  expiryDate?: string;
  /** Dots per inch of the target printer (203 typical). Sizes below assume 203dpi. */
  dpi?: number;
}

function formatMoneyInr(minor: number): string {
  const rupees = Math.floor(Math.abs(minor) / 100);
  const paise = Math.abs(minor) % 100;
  return `${minor < 0 ? "-" : ""}₹${rupees}.${String(paise).padStart(2, "0")}`;
}

export function buildZplLabel(data: LabelData): Uint8Array {
  const price = formatMoneyInr(data.priceMinor);
  const mrp = data.mrpMinor !== undefined ? ` MRP ${formatMoneyInr(data.mrpMinor)}` : "";
  const lines = [
    "^XA",                              // start format
    "^PW384^LL192^LH0,0",               // 50x25mm @203dpi
    "^CI28",                            // UTF-8 encoding
    "^FO20,16^A0N,28,28^FD" + esc(data.itemName.slice(0, 24)) + "^FS",
    "^FO20,50^A0N,24,24^FDSKU: " + esc(data.itemCode.slice(0, 20)) + "^FS",
    "^FO20,80^BCN,64,Y,N,N^FD" + esc(data.barcode) + "^FS",
    "^FO20,152^A0N,24,24^FD" + esc(price + mrp) + "  " + esc(data.netQuantity) + "^FS",
    ...(data.batchNo
      ? ["^FO20,178^A0N,20,20^FDB: " + esc(data.batchNo.slice(0, 24)) + "^FS"]
      : []),
    ...(data.expiryDate
      ? ["^FO220,178^A0N,20,20^FDExp: " + esc(data.expiryDate) + "^FS"]
      : []),
    "^XZ",                              // end format
  ];
  return new TextEncoder().encode(lines.join("\n") + "\n");
}

export function buildTsplLabel(data: LabelData): Uint8Array {
  const price = formatMoneyInr(data.priceMinor);
  const mrp = data.mrpMinor !== undefined ? ` MRP ${formatMoneyInr(data.mrpMinor)}` : "";
  const lines = [
    "SIZE 50 mm,25 mm",
    "GAP 2 mm,0",
    "DIRECTION 1",
    "CLS",
    "TEXT 20,16,\"3\",0,1,1,\"" + esc(data.itemName.slice(0, 24)) + "\"",
    "TEXT 20,50,\"2\",0,1,1,\"SKU: " + esc(data.itemCode.slice(0, 20)) + "\"",
    "BARCODE 20,84,\"128\",48,1,0,2,2,\"" + esc(data.barcode) + "\"",
    "TEXT 20,150,\"2\",0,1,1,\"" + esc(price + mrp) + "  " + esc(data.netQuantity) + "\"",
    ...(data.batchNo
      ? ["TEXT 20,180,\"1\",0,1,1,\"B: " + esc(data.batchNo.slice(0, 24)) + "\""]
      : []),
    ...(data.expiryDate
      ? ["TEXT 220,180,\"1\",0,1,1,\"Exp: " + esc(data.expiryDate) + "\""]
      : []),
    "PRINT 1,1",
  ];
  return new TextEncoder().encode(lines.join("\r\n") + "\r\n");
}

/** ZPL/TSPL data must not inject format commands: strip control chars and ^/~ delimiters. */
function esc(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, "").replace(/[\^~]/g, "-");
}
