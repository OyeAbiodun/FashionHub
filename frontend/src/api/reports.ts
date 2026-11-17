import { apiClient } from "./client";
import type { BusinessReports } from "../types/reports";

export async function fetchBusinessReports(
  startDate: string,
  endDate: string,
): Promise<BusinessReports> {
  return (
    await apiClient.get<BusinessReports>("/reports/summary", {
      params: { start_date: startDate, end_date: endDate },
    })
  ).data;
}
