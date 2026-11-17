export type CommunicationChannel = "WHATSAPP" | "SMS" | "EMAIL";
export type CommunicationStatus = "PREPARED" | "SENT" | "FAILED";

export interface MessageTemplate {
  id: string;
  name: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
}

export interface CommunicationAttempt {
  id: string;
  status: CommunicationStatus;
  note: string | null;
  created_by_name: string;
  created_at: string;
}

export interface CommunicationRecord {
  id: string;
  customer_id: string;
  customer_name: string;
  order_id: string | null;
  order_number: string | null;
  channel: CommunicationChannel;
  status: CommunicationStatus;
  recipient: string;
  subject: string | null;
  body: string;
  handoff_url: string;
  created_by_name: string;
  created_at: string;
  attempts: CommunicationAttempt[];
}

export interface ReminderCandidate {
  customer_id: string;
  customer_name: string;
  phone: string;
  email: string | null;
  order_id: string;
  order_number: string;
  due_date: string;
  outstanding_balance: string;
  days_until_due: number;
  reminder_reason: string;
}
