import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TasksPage } from "./TasksPage";

vi.mock("../api/tasks", () => ({
  fetchTasks: vi.fn().mockResolvedValue({
    items: [
      {
        id: "task-1",
        business_id: "biz-1",
        title: "Cut Agbada Pattern",
        description: "Cut Senator fabric 4 yards",
        assigned_to_id: "user-1",
        assigned_to_name: "Emeka Tailor",
        created_by_id: "user-2",
        created_by_name: "Ada Owner",
        status: "PENDING",
        priority: "HIGH",
        due_at: "2026-08-22T10:00:00Z",
        completed_at: null,
        is_overdue: false,
        created_at: "2026-08-20T08:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
    pending_count: 1,
    in_progress_count: 0,
    completed_count: 0,
    overdue_count: 0,
  }),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock("../api/team", () => ({
  fetchTeamMembers: vi.fn().mockResolvedValue([
    {
      id: "user-1",
      first_name: "Emeka",
      last_name: "Tailor",
      email: "tailor@example.com",
      role: "STAFF",
      is_active: true,
    },
  ]),
}));

describe("TasksPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it("renders task management header and task item", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(await screen.findByText("Cut Agbada Pattern")).toBeInTheDocument();
    expect(screen.getAllByText("Emeka Tailor")[0]).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });
});
