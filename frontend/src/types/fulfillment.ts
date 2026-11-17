export type FulfillmentMethod = "PICKUP" | "DELIVERY";
export type FulfillmentStatus = "PLANNED" | "OUT_FOR_DELIVERY" | "COMPLETED";
export type FulfillmentEventType = "CONFIGURED" | "UPDATED" | "DISPATCHED" | "HANDED_OFF";

export interface FulfillmentEvent {
  id: string;
  event_type: FulfillmentEventType;
  actor_id: string;
  actor_name: string;
  notes: string | null;
  occurred_at: string;
}

export interface OrderFulfillment {
  id: string;
  method: FulfillmentMethod;
  status: FulfillmentStatus;
  recipient_name: string | null;
  recipient_phone: string | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  tracking_reference: string | null;
  proof_of_delivery_url: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  events: FulfillmentEvent[];
}

export interface FulfillmentUpdateInput {
  method: FulfillmentMethod;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  delivery_address?: string | null;
  delivery_instructions?: string | null;
  tracking_reference?: string | null;
  delivery_charge?: string | null;
}

export interface FulfillmentActionInput {
  notes?: string | null;
  proof_of_delivery_url?: string | null;
}
