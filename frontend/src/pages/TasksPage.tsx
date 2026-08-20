import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
  type TaskPriority,
  type TaskStatus,
} from "../api/tasks";
import { fetchTeamMembers } from "../api/team";
import { getApiErrorMessage } from "../api/client";
import {
  Button,
  Card,
  Dialog,
  InlineError,
  MetricCard,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SuccessNotice,
  buttonStyles,
  errorTextStyles,
  inputStyles,
  labelStyles,
  selectStyles,
} from "../components/ui";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  assigned_to_id: z.string().min(1, "Please assign a staff member"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  due_at: z.string().optional().or(z.literal("")),
});

type TaskFormValues = z.infer<typeof taskSchema>;

export function TasksPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("ALL");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formApiError, setFormApiError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeamMembers,
  });

  const tasksQuery = useQuery({
    queryKey: [
      "tasks",
      search,
      selectedStatus,
      selectedPriority,
      selectedAssignee,
    ],
    queryFn: () =>
      fetchTasks({
        search,
        status:
          selectedStatus !== "ALL" && selectedStatus !== "OVERDUE"
            ? (selectedStatus as TaskStatus)
            : undefined,
        priority:
          selectedPriority !== "ALL"
            ? (selectedPriority as TaskPriority)
            : undefined,
        assigned_to_id:
          selectedAssignee !== "ALL" ? selectedAssignee : undefined,
        overdue_only: selectedStatus === "OVERDUE",
      }),
  });

  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      assigned_to_id: "",
      priority: "MEDIUM",
      due_at: "",
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setFormSuccess(true);
      setTimeout(() => {
        setCreateModalOpen(false);
        setFormSuccess(false);
        taskForm.reset();
      }, 1000);
    },
    onError: (err) => {
      setFormApiError(getApiErrorMessage(err));
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: (data: { id: string; status: TaskStatus }) =>
      updateTask(data.id, { status: data.status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  function onCreateSubmit(values: TaskFormValues) {
    setFormApiError("");
    setFormSuccess(false);
    createTaskMutation.mutate({
      title: values.title,
      description: values.description?.trim() || null,
      assigned_to_id: values.assigned_to_id,
      priority: values.priority,
      due_at: values.due_at ? new Date(values.due_at).toISOString() : null,
    });
  }

  const teamMembers = teamQuery.data ?? [];
  const taskData = tasksQuery.data;
  const tasks = taskData?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workroom Studio"
        title="Task Management"
        description="Assign garment production tasks, track workroom assignments, set timeline deadlines, and manage completion status."
        actions={
          <Button
            type="button"
            onClick={() => {
              setCreateModalOpen(true);
              setFormApiError("");
              setFormSuccess(false);
              taskForm.reset();
            }}
          >
            <Plus className="h-4 w-4" />
            Assign New Task
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Tasks"
          value={taskData ? taskData.total.toString() : "..."}
          subtext="Total studio tasks"
          icon={CheckSquare}
        />
        <MetricCard
          label="Pending Tasks"
          value={taskData ? taskData.pending_count.toString() : "..."}
          subtext="Awaiting workroom pickup"
          icon={Clock}
        />
        <MetricCard
          label="In Progress"
          value={taskData ? taskData.in_progress_count.toString() : "..."}
          subtext="Currently being worked on"
          icon={Users}
        />
        <MetricCard
          label="Overdue Deadlines"
          value={taskData ? taskData.overdue_count.toString() : "..."}
          subtext={
            taskData?.overdue_count ? "Requires immediate attention" : "All deadlines on track"
          }
          icon={AlertTriangle}
        />
      </div>

      {/* Main Task List */}
      <div className="mt-8 space-y-6">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              title="Studio Task Board"
              description="Filter tasks by status, timeline deadline, assigned staff member, or priority."
            />

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  className={`${inputStyles} pl-9 h-10`}
                  placeholder="Search task title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className={`${selectStyles} mt-0 h-10 w-auto text-xs`}
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
              >
                <option value="ALL">All Assignees</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
              </select>

              <select
                className={`${selectStyles} mt-0 h-10 w-auto text-xs`}
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
              >
                <option value="ALL">All Priorities</option>
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="URGENT">Urgent Priority</option>
              </select>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
            {[
              { key: "ALL", label: "All Tasks" },
              { key: "PENDING", label: `Pending (${taskData?.pending_count ?? 0})` },
              { key: "IN_PROGRESS", label: `In Progress (${taskData?.in_progress_count ?? 0})` },
              { key: "COMPLETED", label: `Completed (${taskData?.completed_count ?? 0})` },
              { key: "OVERDUE", label: `Overdue Alert (${taskData?.overdue_count ?? 0})` },
            ].map((tab) => (
              <button
                key={tab.key}
                className={buttonStyles({
                  variant: selectedStatus === tab.key ? "primary" : "outline",
                  size: "sm",
                  className: "h-8 px-3 text-xs",
                })}
                type="button"
                onClick={() => setSelectedStatus(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Task Items */}
          <div className="mt-6 space-y-4">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-xl border p-4 transition-all ${
                  task.is_overdue
                    ? "border-red-300 bg-red-50/40"
                    : task.status === "COMPLETED"
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-border bg-white hover:bg-slate-50/80"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-base font-semibold ${
                          task.status === "COMPLETED"
                            ? "line-through text-slate-500"
                            : "text-ink"
                        }`}
                      >
                        {task.title}
                      </p>

                      <PriorityBadge priority={task.priority} />

                      {task.is_overdue ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                          <AlertTriangle className="h-3 w-3" />
                          OVERDUE DEADLINE
                        </span>
                      ) : null}
                    </div>

                    {task.description ? (
                      <p className="text-sm text-muted leading-relaxed">
                        {task.description}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        Assigned to: <strong className="text-ink">{task.assigned_to_name}</strong>
                      </span>

                      {task.due_at ? (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          Deadline:{" "}
                          <strong className={task.is_overdue ? "text-red-700" : "text-ink"}>
                            {new Date(task.due_at).toLocaleString()}
                          </strong>
                        </span>
                      ) : (
                        <span className="text-slate-400">No deadline set</span>
                      )}

                      <span className="text-slate-400">
                        Assigned by: {task.created_by_name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <StatusBadge
                      status={task.status}
                      label={
                        task.status === "IN_PROGRESS"
                          ? "In Progress"
                          : task.status === "PENDING"
                          ? "Pending"
                          : task.status === "COMPLETED"
                          ? "Completed"
                          : "Cancelled"
                      }
                    />

                    {task.status === "PENDING" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        disabled={updateTaskMutation.isPending}
                        onClick={() =>
                          updateTaskMutation.mutate({
                            id: task.id,
                            status: "IN_PROGRESS",
                          })
                        }
                      >
                        Start Task
                      </Button>
                    ) : null}

                    {task.status !== "COMPLETED" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        disabled={updateTaskMutation.isPending}
                        onClick={() =>
                          updateTaskMutation.mutate({
                            id: task.id,
                            status: "COMPLETED",
                          })
                        }
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Complete
                      </Button>
                    ) : null}

                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      type="button"
                      title="Delete task"
                      disabled={deleteTaskMutation.isPending}
                      onClick={() => deleteTaskMutation.mutate(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {tasks.length === 0 ? (
              <div className="py-12 text-center text-muted">
                No tasks found matching filter criteria.
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Create Task Modal */}
      {createModalOpen ? (
        <Dialog title="Assign Studio Task" onClose={() => setCreateModalOpen(false)}>
          <form className="space-y-4" onSubmit={taskForm.handleSubmit(onCreateSubmit)} noValidate>
            <label className="block">
              <span className={labelStyles}>Task Title / Instruction</span>
              <input
                className={inputStyles}
                placeholder="e.g. Cut 4 yards Senator fabric for Order #ORD-0001"
                {...taskForm.register("title")}
              />
              {taskForm.formState.errors.title ? (
                <span className={errorTextStyles}>{taskForm.formState.errors.title.message}</span>
              ) : null}
            </label>

            <label className="block">
              <span className={labelStyles}>Detailed Description & Specifications (optional)</span>
              <textarea
                className={`${inputStyles} min-h-[90px] py-2`}
                placeholder="Add pattern measurements, garment details, or special tailor instructions..."
                {...taskForm.register("description")}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelStyles}>Assign Staff Member</span>
                <select className={selectStyles} {...taskForm.register("assigned_to_id")}>
                  <option value="">Select Tailor / Staff...</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.role === "BUSINESS_ADMIN" ? "Admin" : "Staff"})
                    </option>
                  ))}
                </select>
                {taskForm.formState.errors.assigned_to_id ? (
                  <span className={errorTextStyles}>
                    {taskForm.formState.errors.assigned_to_id.message}
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className={labelStyles}>Task Priority Level</span>
                <select className={selectStyles} {...taskForm.register("priority")}>
                  <option value="LOW">Low Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="HIGH">High Priority</option>
                  <option value="URGENT">Urgent Priority</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className={labelStyles}>Timeline Completion Deadline (optional)</span>
              <input
                type="datetime-local"
                className={inputStyles}
                {...taskForm.register("due_at")}
              />
              <span className="text-xs text-muted mt-1 block">
                Target date and time for the staff member to finish this task.
              </span>
            </label>

            {formApiError ? <InlineError message={formApiError} /> : null}
            {formSuccess ? <SuccessNotice>Task assigned successfully.</SuccessNotice> : null}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button variant="outline" type="button" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={taskForm.formState.isSubmitting}>
                {taskForm.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckSquare className="h-4 w-4" />
                )}
                Assign Task
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, string> = {
    LOW: "bg-slate-100 text-slate-700 border-slate-200",
    MEDIUM: "bg-blue-50 text-blue-700 border-blue-200",
    HIGH: "bg-amber-50 text-amber-800 border-amber-200",
    URGENT: "bg-red-50 text-red-800 border-red-200 font-bold",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] uppercase tracking-wide border ${styles[priority]}`}
    >
      {priority} Priority
    </span>
  );
}
