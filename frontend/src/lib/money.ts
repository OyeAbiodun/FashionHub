export function moneyValue(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoney(value: string | number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(moneyValue(value));
}

export function decimalProduct(value: string, quantity: number): string {
  return (moneyValue(value) * quantity).toFixed(2);
}
