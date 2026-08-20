import { useQuery } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Ruler,
  ShoppingBag,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchCalendarEvents,
  type CalendarEventItem,
  type CalendarEventType,
} from "../api/calendar";
import {
  Button,
  Card,
  Dialog,
  MetricCard,
  PageContainer,
  PageHeader,
  StatusBadge,
  buttonStyles,
} from "../components/ui";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarPage() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [activeEvent, setActiveEvent] = useState<CalendarEventItem | null>(null);

  const calendarQuery = useQuery({
    queryKey: ["calendar", currentYear, currentMonth],
    queryFn: () => fetchCalendarEvents(currentYear, currentMonth),
  });

  const events = calendarQuery.data ?? [];

  const filteredEvents = events.filter((e) => {
    if (selectedFilter === "ALL") return true;
    return e.event_type === selectedFilter;
  });

  // Calculate calendar grid days
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const calendarCells: Array<{ dayNumber: number | null; dateStr: string | null }> = [];

  // Blank padding cells before day 1
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarCells.push({ dayNumber: null, dateStr: null });
  }

  // Days of month
  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(currentMonth).padStart(2, "0");
    const dayStr = String(d).padStart(2, "0");
    calendarCells.push({
      dayNumber: d,
      dateStr: `${currentYear}-${monthStr}-${dayStr}`,
    });
  }

  function handlePrevMonth() {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function handleToday() {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
  }

  const deliveryCount = events.filter((e) => e.event_type === "ORDER_DUE").length;
  const fittingCount = events.filter((e) => e.event_type === "ORDER_FITTING").length;
  const taskCount = events.filter((e) => e.event_type === "TASK_DUE").length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Fulfillment & Schedule"
        title="Workroom Calendar"
        description="Visual schedule of customer order delivery deadlines, garment fitting sessions, and task timelines."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <div className="inline-flex rounded-lg border border-border bg-white shadow-sm p-1">
              <button
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"
                type="button"
                title="Previous Month"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 font-semibold text-sm text-ink self-center">
                {MONTH_NAMES[currentMonth - 1]} {currentYear}
              </span>
              <button
                className="p-1.5 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"
                type="button"
                title="Next Month"
                onClick={handleNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Promised Deliveries"
          value={deliveryCount.toString()}
          subtext={`Due in ${MONTH_NAMES[currentMonth - 1]}`}
          icon={ShoppingBag}
        />
        <MetricCard
          label="Fitting Appointments"
          value={fittingCount.toString()}
          subtext="Garments ready for fitting"
          icon={Ruler}
        />
        <MetricCard
          label="Task Deadlines"
          value={taskCount.toString()}
          subtext="Workroom staff assignments"
          icon={Clock}
        />
      </div>

      {/* Filter Bar & Grid */}
      <div className="mt-8">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <h3 className="font-semibold text-ink text-base flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-primary" />
              {MONTH_NAMES[currentMonth - 1]} {currentYear} Schedule Grid
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "ALL", label: "All Events" },
                { key: "ORDER_DUE", label: `Deliveries (${deliveryCount})` },
                { key: "ORDER_FITTING", label: `Fittings (${fittingCount})` },
                { key: "TASK_DUE", label: `Task Deadlines (${taskCount})` },
              ].map((f) => (
                <button
                  key={f.key}
                  className={buttonStyles({
                    variant: selectedFilter === f.key ? "primary" : "outline",
                    size: "sm",
                    className: "h-8 px-3 text-xs",
                  })}
                  type="button"
                  onClick={() => setSelectedFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar Grid Header */}
          <div className="mt-4 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-border pb-2">
            {WEEKDAY_NAMES.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Calendar Matrix Cells */}
          <div className="grid grid-cols-7 gap-px bg-border mt-1 rounded-b-lg overflow-hidden border border-border">
            {calendarCells.map((cell, idx) => {
              if (!cell.dayNumber) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[100px] bg-slate-50/50 p-2 text-slate-300"
                  />
                );
              }

              const isTodayCell =
                today.getFullYear() === currentYear &&
                today.getMonth() + 1 === currentMonth &&
                today.getDate() === cell.dayNumber;

              const cellEvents = filteredEvents.filter(
                (e) => e.event_date === cell.dateStr
              );

              return (
                <div
                  key={cell.dateStr}
                  className={`min-h-[110px] p-2 flex flex-col justify-between transition-colors ${
                    isTodayCell ? "bg-blue-50/60 ring-2 ring-primary/40 inset-0 z-10" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold ${
                        isTodayCell
                          ? "h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center"
                          : "text-slate-700"
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {cellEvents.length > 0 ? (
                      <span className="text-[10px] font-medium text-slate-400">
                        {cellEvents.length} {cellEvents.length === 1 ? "event" : "events"}
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[85px] pr-0.5">
                    {cellEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setActiveEvent(ev)}
                        className={`w-full text-left rounded px-1.5 py-1 text-[11px] font-medium truncate transition-all block ${
                          ev.event_type === "ORDER_DUE"
                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200"
                            : ev.event_type === "ORDER_FITTING"
                            ? "bg-purple-100 text-purple-800 hover:bg-purple-200 border border-purple-200"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200"
                        }`}
                      >
                        {ev.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Event Details Dialog */}
      {activeEvent ? (
        <Dialog title="Calendar Event Detail" onClose={() => setActiveEvent(null)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <EventBadge type={activeEvent.event_type} />
              <StatusBadge status={activeEvent.status} label={activeEvent.status} />
            </div>

            <div>
              <h4 className="text-base font-bold text-ink">{activeEvent.title}</h4>
              <p className="text-xs text-muted mt-1">
                Scheduled Date:{" "}
                <strong className="text-ink">{new Date(activeEvent.event_date).toLocaleDateString()}</strong>
              </p>
            </div>

            {activeEvent.customer_name ? (
              <div className="rounded-lg border border-border p-3 bg-slate-50 text-xs">
                <span className="text-slate-500 block">Customer:</span>
                <span className="font-semibold text-ink">{activeEvent.customer_name}</span>
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button variant="outline" onClick={() => setActiveEvent(null)}>
                Close
              </Button>

              {activeEvent.order_id ? (
                <Link
                  to={`/orders/${activeEvent.order_id}`}
                  className={buttonStyles({ variant: "primary" })}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Order Detail
                </Link>
              ) : null}

              {activeEvent.task_id ? (
                <Link to="/tasks" className={buttonStyles({ variant: "primary" })}>
                  <ExternalLink className="h-4 w-4" />
                  Go to Task Board
                </Link>
              ) : null}
            </div>
          </div>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}

function EventBadge({ type }: { type: CalendarEventType }) {
  const label =
    type === "ORDER_DUE"
      ? "Promised Delivery"
      : type === "ORDER_FITTING"
      ? "Garment Fitting"
      : "Task Deadline";

  const color =
    type === "ORDER_DUE"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : type === "ORDER_FITTING"
      ? "bg-purple-100 text-purple-800 border-purple-200"
      : "bg-emerald-100 text-emerald-800 border-emerald-200";

  return (
    <span
      className={`inline-block rounded px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide border ${color}`}
    >
      {label}
    </span>
  );
}
