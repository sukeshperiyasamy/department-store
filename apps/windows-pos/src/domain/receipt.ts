/**
 * Receipt rendering.
 *
 * buildEscPosReceipt produces raw ESC/POS bytes for compatible thermal printers.
 * A print failure must never lose or duplicate the underlying sale: printing is
 * independent of syncing (receipt_printed flag is tracked on the sync record and
 * reprinting is always available from the transaction view).
 */
import { formatMoney, money } from "./money";

export interface ReceiptLine {
  itemName: string;
  qty: number;
  uom: string;
  rateMinor: number;
  amountMinor: number;
}

export interface ReceiptPayment {
  modeOfPayment: string;
  amountMinor: number;
  referenceNo?: string;
}

export interface ReceiptData {
  storeName: string;
  counterName: string;
  cashier: string;
  /** Server invoice name — absent while the sale is only locally saved. */
  invoiceName?: string;
  transactionId: string;
  lines: ReceiptLine[];
  payments: ReceiptPayment[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  changeMinor: number;
  currency: string;
  /** ISO timestamp of the sale. */
  occurredAt: string;
  /** Reprints must be marked. */
  duplicate?: boolean;
  footerNote?: string;
}

const ESC = 0x1b;
const GS = 0x1d;
const WIDTH = 42; // 80mm thermal at 12x24 font ≈ 42 chars

export function buildEscPosReceipt(data: ReceiptData): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: number[] = [];
  const push = (...bytes: number[]) => chunks.push(...bytes);
  const pushText = (text: string) => chunks.push(...encoder.encode(text));

  // Initialize printer
  push(ESC, 0x40);
  // Center mode for header
  push(ESC, 0x61, 0x01);
  pushText(data.storeName + "\n");
  pushText(`${data.counterName} · ${data.cashier}\n`);
  push(ESC, 0x61, 0x00);

  pushText(line("-"));
  pushText(`Bill: ${data.invoiceName ?? "(pending sync)"}\n`);
  pushText(`Date: ${formatTimestamp(data.occurredAt)}\n`);
  if (data.duplicate) pushText("*** DUPLICATE COPY ***\n");
  pushText(line("-"));

  for (const line of data.lines) {
    pushText(`${truncate(line.itemName, 32)}\n`);
    pushText(
      padRight(`  ${formatQty(line.qty)} ${line.uom} x ${formatMoney(money(line.rateMinor, data.currency))}`, 28) +
        padLeft(formatMoney(money(line.amountMinor, data.currency)), 14) + "\n",
    );
  }

  pushText(line("-"));
  pushText(row("Subtotal", formatMoney(money(data.subtotalMinor, data.currency))));
  pushText(row("Tax", formatMoney(money(data.taxMinor, data.currency))));
  pushText(row("TOTAL", formatMoney(money(data.totalMinor, data.currency))));
  pushText(line("-"));

  for (const payment of data.payments) {
    pushText(row(payment.modeOfPayment, formatMoney(money(payment.amountMinor, data.currency))));
    if (payment.referenceNo) pushText(`  Ref: ${payment.referenceNo}\n`);
  }
  if (data.changeMinor > 0) {
    pushText(row("Change", formatMoney(money(data.changeMinor, data.currency))));
  }

  pushText(line("-"));
  push(ESC, 0x61, 0x01);
  pushText(`Txn: ${data.transactionId}\n`);
  if (data.footerNote) pushText(`${data.footerNote}\n`);
  pushText("Thank you!\n");
  push(ESC, 0x61, 0x00);

  // Full cut
  push(GS, 0x56, 0x42, 0x00);

  return new Uint8Array(chunks);
}

/** Plain-text preview for the UI receipt panel. */
export function buildReceiptText(data: ReceiptData): string {
  const decoder = new TextDecoder();
  return decoder.decode(buildEscPosReceipt(data).filter((b) => b >= 0x20 || b === 0x0a));
}

function line(char: string): string {
  return char.repeat(WIDTH) + "\n";
}

function row(label: string, value: string): string {
  return padRight(truncate(label, 26), 28) + padLeft(value, 14) + "\n";
}

function padRight(s: string, n: number): string {
  return s.length >= n ? truncate(s, n) : s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? truncate(s, n) : " ".repeat(n - s.length) + s;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(3);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
