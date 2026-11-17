import { apiClient } from "./client";
import type { InventoryItem, MaterialUsage, StockMovement, Supplier } from "../types/inventory";

export interface InventoryItemInput {
  name: string;
  sku?: string;
  unit: string;
  reorder_level: string;
  supplier_id?: string | null;
  description?: string;
  is_active?: boolean;
}

export interface SupplierInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export async function listInventory(params: { search?: string; low_stock_only?: boolean } = {}) {
  return (await apiClient.get<{ items: InventoryItem[]; total: number }>("/inventory/items", { params })).data;
}

export async function saveInventoryItem(payload: InventoryItemInput, itemId?: string) {
  return (await (itemId ? apiClient.put<InventoryItem>(`/inventory/items/${itemId}`, payload) : apiClient.post<InventoryItem>("/inventory/items", payload))).data;
}

export async function listSuppliers() {
  return (await apiClient.get<Supplier[]>("/inventory/suppliers")).data;
}

export async function saveSupplier(payload: SupplierInput, supplierId?: string) {
  return (await (supplierId ? apiClient.put<Supplier>(`/inventory/suppliers/${supplierId}`, payload) : apiClient.post<Supplier>("/inventory/suppliers", payload))).data;
}

export async function archiveSupplier(supplierId: string) {
  await apiClient.delete(`/inventory/suppliers/${supplierId}`);
}

export async function recordStockMovement(itemId: string, payload: { movement_type: "RECEIPT" | "ADJUSTMENT"; quantity: string; reason: string; unit_cost?: string }) {
  return (await apiClient.post<InventoryItem>(`/inventory/items/${itemId}/movements`, payload)).data;
}

export async function listStockMovements(itemId: string) {
  return (await apiClient.get<StockMovement[]>(`/inventory/items/${itemId}/movements`)).data;
}

export async function listOrderMaterials(orderId: string) {
  return (await apiClient.get<MaterialUsage[]>(`/inventory/orders/${orderId}/materials`)).data;
}

export async function consumeOrderMaterial(orderId: string, payload: { item_id: string; quantity: string; notes?: string }) {
  return (await apiClient.post<MaterialUsage>(`/inventory/orders/${orderId}/materials`, payload)).data;
}
