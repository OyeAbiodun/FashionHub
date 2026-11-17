import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarPage } from "./CalendarPage";

const eventDate = vi.hoisted(() => new Date().toISOString().slice(0, 10));

vi.mock("../api/calendar", () => ({
  fetchCalendarEvents: vi.fn().mockResolvedValue([
    {
      id: "order:ord-1",
      event_type: "ORDER_DUE",
      title: "#ORD-0001 - Ada Okafor (Senate Suit)",
      event_date: eventDate,
      status: "IN_PRODUCTION",
      customer_name: "Ada Okafor",
      order_id: "ord-1",
    },
    {
      id: "order:ord-2",
      event_type: "ORDER_FITTING",
      title: "#ORD-0002 - Emeka Fitting",
      event_date: eventDate,
      status: "FITTING",
      customer_name: "Emeka Tailor",
      order_id: "ord-2",
    },
  ]),
}));

describe("CalendarPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("renders workroom calendar page and event badges", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText("Workroom Calendar")).toBeInTheDocument();
    expect(await screen.findByText("#ORD-0001 - Ada Okafor (Senate Suit)")).toBeInTheDocument();
    expect(screen.getByText("#ORD-0002 - Emeka Fitting")).toBeInTheDocument();
  });
});
