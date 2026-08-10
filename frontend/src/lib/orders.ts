import type { OrderStatus } from "../types/order";

export const ORDER_STATUSES: OrderStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "CUTTING",
  "SEWING",
  "FITTING",
  "FINISHING",
  "READY",
  "DELIVERED",
  "CANCELLED",
];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CUTTING", "CANCELLED"],
  CUTTING: ["SEWING", "CANCELLED"],
  SEWING: ["FITTING", "FINISHING", "CANCELLED"],
  FITTING: ["SEWING", "FINISHING", "CANCELLED"],
  FINISHING: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "FINISHING", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function formatStatus(status: string | null): string {
  return status ? status.replace(/_/g, " ") : "Not set";
}

export function overdueText(overdueDays: number): string {
  return overdueDays > 0 ? `Overdue by ${overdueDays} days` : "Overdue";
}

export function customerFullName(customer: {
  first_name: string;
  last_name: string | null;
}): string {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ");
}
