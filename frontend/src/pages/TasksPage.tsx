import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckSquare, Circle, Clock3, MessageSquare, Plus, Search, Send, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { addTaskComment as postComment, createTask, deleteTask, fetchTaskComments, fetchTasks, updateTask, type TaskItem, type TaskPriority, type TaskStatus } from "../api/tasks";
import { fetchTeamMembers } from "../api/team";
import { getApiErrorMessage } from "../api/client";
import { Button, Card, Dialog, InlineError, MetricCard, PageContainer, PageHeader, inputStyles, labelStyles, selectStyles } from "../components/ui";

const taskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  assigned_to_id: z.string().min(1, "Please assign a staff member"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  due_at: z.string().optional().or(z.literal("")),
});
type TaskFormValues = z.infer<typeof taskSchema>;

const columns: { status: TaskStatus; title: string; accent: string }[] = [
  { status: "PENDING", title: "To do", accent: "border-t-slate-400" },
  { status: "IN_PROGRESS", title: "In progress", accent: "border-t-blue-500" },
  { status: "COMPLETED", title: "Completed", accent: "border-t-emerald-500" },
  { status: "CANCELLED", title: "Cancelled", accent: "border-t-rose-400" },
];

export function TasksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("ALL");
  const [assignee, setAssignee] = useState("ALL");
  const [taskFilter, setTaskFilter] = useState<"ALL" | "PENDING" | "IN_PROGRESS" | "OVERDUE">("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [formError, setFormError] = useState("");

  const teamQuery = useQuery({ queryKey: ["team"], queryFn: fetchTeamMembers });
  const tasksQuery = useQuery({
    queryKey: ["tasks", search, priority, assignee, taskFilter],
    queryFn: () => fetchTasks({ search, priority: priority === "ALL" ? undefined : priority as TaskPriority, assigned_to_id: assignee === "ALL" ? undefined : assignee, status: taskFilter === "PENDING" || taskFilter === "IN_PROGRESS" ? taskFilter : undefined, overdue_only: taskFilter === "OVERDUE", page_size: 100 }),
  });
  const commentsQuery = useQuery({
    queryKey: ["task-comments", activeTask?.id],
    queryFn: () => fetchTaskComments(activeTask!.id),
    enabled: Boolean(activeTask),
  });
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", description: "", assigned_to_id: "", priority: "MEDIUM", due_at: "" },
  });
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });
  const moveMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) => updateTask(taskId, { status }),
    onSuccess: refreshTasks,
  });
  const createMutation = useMutation({
    mutationFn: (values: TaskFormValues) => createTask({ title: values.title, description: values.description?.trim() || null, assigned_to_id: values.assigned_to_id, priority: values.priority, due_at: values.due_at ? new Date(values.due_at).toISOString() : null }),
    onSuccess: async () => { await refreshTasks(); setCreateOpen(false); form.reset(); },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  });
  const deleteMutation = useMutation({ mutationFn: deleteTask, onSuccess: refreshTasks });
  const commentMutation = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: string }) => postComment(taskId, body),
    onSuccess: async () => { setCommentText(""); await queryClient.invalidateQueries({ queryKey: ["task-comments", activeTask?.id] }); },
  });

  const tasks = tasksQuery.data?.items ?? [];
  const members = teamQuery.data ?? [];

  function moveTask(taskId: string, status: TaskStatus) {
    const task = tasks.find((item) => item.id === taskId);
    if (task && task.status !== status) moveMutation.mutate({ taskId, status });
    setDraggedTaskId(null);
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workroom Studio"
        title="Tasks"
        description="Plan the work, see who owns each task, and move it through your workroom at a glance."
        actions={<Button onClick={() => { setFormError(""); setCreateOpen(true); form.reset(); }}><Plus className="h-4 w-4" />Add task</Button>}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="All tasks" value={String(tasksQuery.data?.total ?? "—")} subtext="Show every task" icon={CheckSquare} onClick={() => setTaskFilter("ALL")} active={taskFilter === "ALL"} />
        <MetricCard label="To do" value={String(tasksQuery.data?.pending_count ?? "—")} subtext="Show tasks waiting to start" icon={Circle} onClick={() => setTaskFilter("PENDING")} active={taskFilter === "PENDING"} />
        <MetricCard label="In progress" value={String(tasksQuery.data?.in_progress_count ?? "—")} subtext="Show active work" icon={Clock3} onClick={() => setTaskFilter("IN_PROGRESS")} active={taskFilter === "IN_PROGRESS"} />
        <MetricCard label="Overdue" value={String(tasksQuery.data?.overdue_count ?? "—")} subtext="Show tasks needing attention" icon={AlertTriangle} onClick={() => setTaskFilter("OVERDUE")} active={taskFilter === "OVERDUE"} />
      </div>

      <Card className="mt-6 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2fr)] lg:items-center">
          <div className="min-w-0">
            <h2 className="font-semibold text-ink">Workroom board</h2>
            <p className="mt-1 text-sm text-muted">Drag a task to another column, or use its status menu on touch screens.</p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(145px,0.55fr)_minmax(145px,0.55fr)]">
            <label className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${inputStyles} h-10 pl-9`} aria-label="Search tasks" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <select className={`${selectStyles} mt-0 h-10 w-auto`} aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="ALL">All priorities</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
            </select>
            <select className={`${selectStyles} mt-0 h-10 w-auto`} aria-label="Filter by assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="ALL">Everyone</option>{members.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}
            </select>
          </div>
        </div>

        {tasksQuery.isLoading ? <div className="py-16 text-center text-sm text-muted">Loading tasks…</div> : null}
        {tasksQuery.isError ? <div className="py-10 text-center text-sm text-rose-700">Tasks could not be loaded. Refresh the page and try again.</div> : null}
        {!tasksQuery.isLoading && !tasksQuery.isError ? (
          tasks.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
              <CheckSquare className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 font-semibold text-ink">{search || priority !== "ALL" || assignee !== "ALL" ? "No matching tasks" : "Your board is clear"}</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{search || priority !== "ALL" || assignee !== "ALL" || taskFilter !== "ALL" ? "Try changing or clearing the filters." : "Add the first task and your team can track its progress here."}</p>
              {!search && priority === "ALL" && assignee === "ALL" && taskFilter === "ALL" ? <Button className="mt-4" onClick={() => { setFormError(""); setCreateOpen(true); form.reset(); }}><Plus className="h-4 w-4" />Create first task</Button> : null}
            </div>
          ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {columns.map((column) => {
              const columnTasks = tasks.filter((task) => task.status === column.status);
              return (
                <section key={column.status} aria-label={`${column.title} tasks`} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedTaskId && moveTask(draggedTaskId, column.status)} className={`min-h-64 rounded-xl border border-border border-t-4 ${column.accent} bg-slate-50/70 p-3`}>
                  <header className="mb-3 flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-ink">{column.title}</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-muted">{columnTasks.length}</span>
                  </header>
                  <div className="space-y-3">
                    {columnTasks.map((task) => <TaskCard key={task.id} task={task} moving={moveMutation.isPending} onOpen={() => setActiveTask(task)} onMove={(status) => moveTask(task.id, status)} onDelete={() => deleteMutation.mutate(task.id)} onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => setDraggedTaskId(null)} />)}
                    {columnTasks.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-muted">Drop tasks here</div> : null}
                  </div>
                </section>
              );
            })}
          </div>
          )
        ) : null}
      </Card>

      {createOpen ? <Dialog title="Create a task" onClose={() => setCreateOpen(false)}>
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => { setFormError(""); createMutation.mutate(values); })} noValidate>
          <label className="block"><span className={labelStyles}>Task title</span><input className={inputStyles} placeholder="e.g. Cut fabric for order" {...form.register("title")} />{form.formState.errors.title ? <span className="text-xs text-rose-700">{form.formState.errors.title.message}</span> : null}</label>
          <label className="block"><span className={labelStyles}>Instructions</span><textarea className={`${inputStyles} min-h-24 py-2`} placeholder="Add garment details or handover notes" {...form.register("description")} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className={labelStyles}>Assigned to</span><select className={selectStyles} {...form.register("assigned_to_id")}><option value="">Choose a team member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.first_name} {member.last_name}</option>)}</select>{form.formState.errors.assigned_to_id ? <span className="text-xs text-rose-700">{form.formState.errors.assigned_to_id.message}</span> : null}</label>
            <label className="block"><span className={labelStyles}>Priority</span><select className={selectStyles} {...form.register("priority")}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          </div>
          <label className="block"><span className={labelStyles}>Due date</span><input type="datetime-local" className={inputStyles} {...form.register("due_at")} /></label>
          {formError ? <InlineError message={formError} /> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={createMutation.isPending}><Plus className="h-4 w-4" />{createMutation.isPending ? "Creating…" : "Create task"}</Button></div>
        </form>
      </Dialog> : null}

      {activeTask ? <Dialog title="Task details" onClose={() => setActiveTask(null)}>
        <div className="space-y-5">
          <div><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-ink">{activeTask.title}</h3><p className="mt-1 text-sm text-muted">Created by {activeTask.created_by_name}</p></div><PriorityBadge priority={activeTask.priority} /></div>{activeTask.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{activeTask.description}</p> : <p className="mt-4 text-sm text-muted">No additional instructions.</p>}</div>
          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" />{activeTask.assigned_to_name}</p><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{activeTask.due_at ? new Date(activeTask.due_at).toLocaleString() : "No due date"}</p></div>
          <div><h4 className="font-semibold text-ink">Comments</h4><div className="mt-3 max-h-56 space-y-3 overflow-y-auto">{commentsQuery.isLoading ? <p className="text-sm text-muted">Loading comments…</p> : null}{commentsQuery.data?.map((comment) => <article key={comment.id} className="rounded-lg border border-border bg-white p-3"><div className="flex justify-between gap-3 text-xs"><strong className="text-ink">{comment.author_name}</strong><time className="text-muted">{new Date(comment.created_at).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p></article>)}{!commentsQuery.isLoading && !commentsQuery.data?.length ? <p className="text-sm text-muted">No comments yet. Add a note for the team.</p> : null}</div>
            <form className="mt-3 flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (commentText.trim()) commentMutation.mutate({ taskId: activeTask.id, body: commentText.trim() }); }}><label className="min-w-0 flex-1"><span className="sr-only">Add a comment</span><textarea className={`${inputStyles} min-h-20 py-2`} value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write a comment…" maxLength={4000} /></label><Button type="submit" disabled={!commentText.trim() || commentMutation.isPending} aria-label="Post comment"><Send className="h-4 w-4" /></Button></form>
          </div>
        </div>
      </Dialog> : null}
    </PageContainer>
  );
}

function TaskCard({ task, moving, onOpen, onMove, onDelete, onDragStart, onDragEnd }: { task: TaskItem; moving: boolean; onOpen: () => void; onMove: (status: TaskStatus) => void; onDelete: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  return <article draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="group cursor-grab rounded-xl border border-border bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing">
    <button type="button" onClick={onOpen} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <div className="flex items-start justify-between gap-2"><h4 className="font-semibold leading-5 text-ink">{task.title}</h4><PriorityBadge priority={task.priority} /></div>
      {task.description ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{task.description}</p> : null}
    </button>
    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
      <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-600"><UserRound className="h-3.5 w-3.5 shrink-0" />{task.assigned_to_name}</span>
      {task.due_at ? <span className={`flex shrink-0 items-center gap-1 text-xs ${task.is_overdue ? "font-semibold text-rose-700" : "text-muted"}`}><CalendarDays className="h-3.5 w-3.5" />{new Date(task.due_at).toLocaleDateString()}</span> : null}
    </div>
    {task.is_overdue ? <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Overdue</p> : null}
    <div className="mt-3 flex items-center justify-between gap-2">
      <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"><MessageSquare className="h-3.5 w-3.5" />View and comment</button>
      <div className="flex items-center gap-1"><label className="sr-only">Move {task.title}</label><select className="max-w-28 rounded-md border border-border bg-white px-2 py-1 text-xs" aria-label={`Move ${task.title}`} value={task.status} disabled={moving} onChange={(event) => onMove(event.target.value as TaskStatus)}><option value="PENDING">To do</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select><button type="button" onClick={onDelete} className="rounded p-1 text-muted hover:bg-rose-50 hover:text-rose-700" aria-label={`Delete ${task.title}`}><X className="h-4 w-4" /></button></div>
    </div>
  </article>;
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const tones: Record<TaskPriority, string> = { LOW: "bg-slate-100 text-slate-700", MEDIUM: "bg-blue-50 text-blue-700", HIGH: "bg-amber-50 text-amber-800", URGENT: "bg-rose-50 text-rose-700" };
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tones[priority]}`}>{priority}</span>;
}
