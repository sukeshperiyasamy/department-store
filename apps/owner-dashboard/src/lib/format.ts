/** Indian Rupee formatting with lakh/crore grouping (en-IN). */
export function formatINR(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const body = Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₹${body}`;
}
