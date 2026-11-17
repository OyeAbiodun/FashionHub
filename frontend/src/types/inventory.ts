export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  archived_at: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  reorder_level: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string | null;
  is_active: boolean;
  current_stock: string;
  is_low_stock: boolean;
  created_at: string;
}

export type StockMovementType = "RECEIPT" | "CONSUMPTION" | "ADJUSTMENT";

export interface StockMovement {
  id: string;
  item_id: string;
  item_name: string;
  order_id: string | null;
  movement_type: StockMovementType;
  quantity_delta: string;
  unit_cost: string | null;
  reason: string;
  created_by_name: string;
  created_at: string;
}

export interface MaterialUsage {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  unit: string;
  quantity: string;
  notes: string | null;
  created_by_name: string;
  created_at: string;
}
