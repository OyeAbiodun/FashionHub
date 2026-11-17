import { apiClient } from "./client";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskItem {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  order_id: string | null;
  customer_id: string | null;
  assigned_to_id: string;
  assigned_to_name: string;
  created_by_id: string;
  created_by_name: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface TaskListResponse {
  items: TaskItem[];
  total: number;
  page: number;
  page_size: number;
  pending_count: number;
  in_progress_count: number;
  completed_count: number;
  overdue_count: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TaskCreatePayload {
  title: string;
  description?: string | null;
  order_id?: string | null;
  customer_id?: string | null;
  assigned_to_id: string;
  priority?: TaskPriority;
  due_at?: string | null;
}

export interface TaskUpdatePayload {
  title?: string;
  description?: string | null;
  assigned_to_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_at?: string | null;
}

export async function fetchTasks(params?: {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to_id?: string;
  overdue_only?: boolean;
  page?: number;
  page_size?: number;
}): Promise<TaskListResponse> {
  const response = await apiClient.get<TaskListResponse>("/tasks", { params });
  return response.data;
}

export async function createTask(payload: TaskCreatePayload): Promise<TaskItem> {
  const response = await apiClient.post<TaskItem>("/tasks", payload);
  return response.data;
}

export async function updateTask(
  taskId: string,
  payload: TaskUpdatePayload
): Promise<TaskItem> {
  const response = await apiClient.patch<TaskItem>(`/tasks/${taskId}`, payload);
  return response.data;
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiClient.delete(`/tasks/${taskId}`);
}

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  const response = await apiClient.get<TaskComment[]>(`/tasks/${taskId}/comments`);
  return response.data;
}

export async function addTaskComment(taskId: string, body: string): Promise<TaskComment> {
  const response = await apiClient.post<TaskComment>(`/tasks/${taskId}/comments`, { body });
  return response.data;
}
