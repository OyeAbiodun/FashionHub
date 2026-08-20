import { apiClient } from "./client";

export type CalendarEventType = "ORDER_DUE" | "ORDER_FITTING" | "TASK_DUE";

export interface CalendarEventItem {
  id: string;
  event_type: CalendarEventType;
  title: string;
  event_date: string;
  status: string;
  customer_name?: string | null;
  order_id?: string | null;
  task_id?: string | null;
  priority?: string | null;
}

export async function fetchCalendarEvents(
  year: number,
  month: number
): Promise<CalendarEventItem[]> {
  const response = await apiClient.get<CalendarEventItem[]>("/dashboard/calendar", {
    params: { year, month },
  });
  return response.data;
}
