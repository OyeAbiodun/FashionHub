import { apiClient } from "./client";
import type { CommunicationChannel, CommunicationRecord, CommunicationStatus, MessageTemplate, ReminderCandidate } from "../types/communication";

export interface MessageTemplateInput {
  name: string;
  channel: CommunicationChannel;
  subject?: string;
  body: string;
  is_active?: boolean;
}

export async function listMessageTemplates() {
  return (await apiClient.get<MessageTemplate[]>("/communication/templates")).data;
}

export async function saveMessageTemplate(payload: MessageTemplateInput, id?: string) {
  return (await (id ? apiClient.put<MessageTemplate>(`/communication/templates/${id}`, payload) : apiClient.post<MessageTemplate>("/communication/templates", payload))).data;
}

export async function archiveMessageTemplate(id: string) {
  await apiClient.delete(`/communication/templates/${id}`);
}

export async function listReminderCandidates(days_ahead = 7) {
  return (await apiClient.get<{ items: ReminderCandidate[] }>("/communication/reminders", { params: { days_ahead } })).data.items;
}

export async function listCommunications() {
  return (await apiClient.get<CommunicationRecord[]>("/communication/records")).data;
}

export async function prepareCommunication(payload: { customer_id: string; order_id?: string; template_id?: string; channel?: CommunicationChannel; subject?: string; body?: string }) {
  return (await apiClient.post<CommunicationRecord>("/communication/records", payload)).data;
}

export async function recordCommunicationOutcome(id: string, status: Exclude<CommunicationStatus, "PREPARED">, note?: string) {
  return (await apiClient.post<CommunicationRecord>(`/communication/records/${id}/outcome`, { status, note })).data;
}

export async function sendCommunication(id: string) {
  return (await apiClient.post<CommunicationRecord>(`/communication/records/${id}/send`)).data;
}
