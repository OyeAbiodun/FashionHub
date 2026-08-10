import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  ClipboardList,
  PackageCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import {
  AvatarInitials,
  Card,
  EmptyState,
  InlineError,
  PageContainer,
  PageHeader,
  SectionHeader,
  Skeleton,
  StatusBadge,
  buttonStyles,
} from "../components/ui";
import {
  useDashboardAlerts,
  useDashboardDueOrders,
  useDashboardRecentOrders,
  useDashboardRecentPayments,
  useDashboardSummary,
} from "../hooks/useDashboard";
import { useAuth } from "../hooks/useAuth";
import { formatDate, formatDateTime } from "../lib/date";
import { formatMoney } from "../lib/money";
import { formatStatus } from "../lib/orders";
import type {
  DashboardAlert,
  DashboardOrderItem,
  DashboardPaymentItem,
} from "../types/dashboard";

export function DashboardPage() {
  const { user, business } = useAuth();
  const summary = useDashboardSummary();
  const alerts = useDashboardAlerts();
  const dueOrders = useDashboardDueOrders();
  const recentOrders = useDashboardRecentOrders();
  const recentPayments = useDashboardRecentPayments();
  const firstName = user?.first_name ?? "there";
  const currency = business?.currency ?? "NGN";
  const timezone = business?.timezone;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting()}, ${firstName}`}
        description={`Here’s what needs your attention at ${business?.name ?? "your workroom"} today.`}
      />

      {summary.isLoading ? <SummarySkeleton /> : null}
      {summary.isError ? (
        <div className="mt-6">
          <InlineError
            message="Could not load dashboard totals."
            retry={() => void summary.refetch()}
          />
        </div>
      ) : null}
      {summary.data ? (
        <>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              icon={CalendarClock}
              label="Due Today"
              value={summary.data.due_today}
              supporting="Orders requiring attention"
              to="/orders?due=today"
              tone={summary.data.due_today > 0 ? "warning" : "default"}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Overdue"
              value={summary.data.overdue_orders}
              supporting="Past their promised date"
              to="/orders?due=overdue"
              tone={summary.data.overdue_orders > 0 ? "danger" : "default"}
            />
            <MetricCard
              icon={ClipboardList}
              label="Active Orders"
              value={summary.data.active_orders}
              supporting={`${summary.data.ready_for_pickup} ready for pickup`}
              to="/orders"
            />
            <MetricCard
              icon={Banknote}
              label="Collected This Month"
              value={formatMoney(summary.data.collected_this_month, currency)}
              supporting="Successful payments"
            />
            <MetricCard
              icon={WalletCards}
              label="Outstanding Balance"
              value={formatMoney(summary.data.outstanding_balance, currency)}
              supporting="Across non-cancelled orders"
              to="/orders"
            />
            <MetricCard
              icon={Users}
              label="Customers"
              value={summary.data.total_customers}
              supporting="Active client records"
              to="/customers"
            />
          </div>

          {summary.data.total_customers === 0 ? (
            <Card className="mt-6 border-dashed">
              <EmptyState
                icon={Users}
                title="Start with your first customer"
                description="Add your first customer to begin managing measurements, orders, and payments in one place."
                action={
                  <Link className={buttonStyles()} to="/customers/new">
                    Add Customer
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                }
              />
            </Card>
          ) : null}
        </>
      ) : null}

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardSection
          title="Operational Alerts"
          description="Prioritized issues that need action."
        >
          {alerts.isLoading ? <ListSkeleton /> : null}
          {alerts.isError ? (
            <InlineError
              message="Could not load operational alerts."
              retry={() => void alerts.refetch()}
            />
          ) : null}
          {alerts.data?.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="No urgent operational issues right now."
              description="The workroom is clear of overdue, due-today, and unpaid-delivered alerts."
              compact
            />
          ) : null}
          <div className="divide-y divide-border">
            {alerts.data?.map((alert) => (
              <AlertRow alert={alert} key={alert.id} />
            ))}
          </div>
        </DashboardSection>

        <DashboardSection
          title="Orders Due Soon"
          description="Overdue work and the next seven days."
          action={
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              to="/orders"
            >
              View all
            </Link>
          }
        >
          {dueOrders.isLoading ? <ListSkeleton /> : null}
          {dueOrders.isError ? (
            <InlineError
              message="Could not load due orders."
              retry={() => void dueOrders.refetch()}
            />
          ) : null}
          {dueOrders.data?.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No orders are due in the next seven days."
              description="Upcoming work will appear here as due dates approach."
              compact
            />
          ) : null}
          <div className="divide-y divide-border">
            {dueOrders.data?.map((order) => (
              <OrderRow order={order} currency={currency} key={order.id} />
            ))}
          </div>
        </DashboardSection>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DashboardSection
          title="Recent Orders"
          description="The latest orders added to this workspace."
          action={
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              to="/orders"
            >
              View All Orders
            </Link>
          }
        >
          {recentOrders.isLoading ? <ListSkeleton /> : null}
          {recentOrders.isError ? (
            <InlineError
              message="Could not load recent orders."
              retry={() => void recentOrders.refetch()}
            />
          ) : null}
          {recentOrders.data?.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders have been created yet."
              description="New production orders will appear here."
              compact
            />
          ) : null}
          <div className="divide-y divide-border">
            {recentOrders.data?.map((order) => (
              <OrderRow order={order} currency={currency} key={order.id} />
            ))}
          </div>
        </DashboardSection>

        <DashboardSection
          title="Recent Payments"
          description="Newest successful payments recorded."
        >
          {recentPayments.isLoading ? <ListSkeleton /> : null}
          {recentPayments.isError ? (
            <InlineError
              message="Could not load recent payments."
              retry={() => void recentPayments.refetch()}
            />
          ) : null}
          {recentPayments.data?.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No payments have been recorded yet."
              description="Successful order payments will appear here."
              compact
            />
          ) : null}
          <div className="divide-y divide-border">
            {recentPayments.data?.map((payment) => (
              <PaymentRow
                payment={payment}
                currency={currency}
                timezone={timezone}
                key={payment.id}
              />
            ))}
          </div>
        </DashboardSection>
      </div>
    </PageContainer>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  supporting,
  to,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  supporting: string;
  to?: string;
  tone?: "default" | "warning" | "danger";
}) {
  const tones = {
    default: "bg-primary-soft text-primary",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-danger",
  };
  const content = (
    <Card className="group h-full p-5 transition hover:border-stone-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {to ? (
          <ArrowRight
            className="h-4 w-4 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted">{supporting}</p>
    </Card>
  );
  return to ? (
    <Link
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      to={to}
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function DashboardSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <SectionHeader title={title} description={description} action={action} />
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function AlertRow({ alert }: { alert: DashboardAlert }) {
  return (
    <article className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          alert.severity === "HIGH"
            ? "bg-red-50 text-danger"
            : alert.severity === "WARNING"
              ? "bg-amber-50 text-warning"
              : "bg-blue-50 text-info"
        }`}
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink">{alert.title}</h3>
          <StatusBadge status={alert.severity} />
        </div>
        <p className="mt-1 text-sm leading-5 text-muted">{alert.message}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>Relevant date: {formatDate(alert.created_from)}</span>
          <Link
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            to={`/orders/${alert.order_id}`}
          >
            View Order <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function OrderRow({
  order,
  currency,
}: {
  order: DashboardOrderItem;
  currency: string;
}) {
  return (
    <Link
      className="group flex items-start gap-3 py-4 first:pt-0 last:pb-0"
      to={`/orders/${order.id}`}
    >
      <AvatarInitials name={order.customer_name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-ink group-hover:text-primary">
              {order.order_number}
            </p>
            <p className="text-sm text-muted">{order.customer_name}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-2 truncate text-sm text-stone-700">
          {order.garment_summary || "Garment order"}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span
            className={
              order.is_overdue ? "font-semibold text-danger" : "text-muted"
            }
          >
            {order.is_overdue
              ? `Overdue by ${order.days_overdue} day${order.days_overdue === 1 ? "" : "s"}`
              : `Due ${formatDate(order.due_date)}`}
          </span>
          <span className="font-semibold text-ink">
            Balance {formatMoney(order.outstanding_balance, currency)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function PaymentRow({
  payment,
  currency,
  timezone,
}: {
  payment: DashboardPaymentItem;
  currency: string;
  timezone?: string;
}) {
  return (
    <Link
      className="group flex items-center gap-3 py-4 first:pt-0 last:pb-0"
      to={`/orders/${payment.order_id}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Banknote className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink group-hover:text-primary">
          {payment.customer_name}
        </p>
        <p className="truncate text-sm text-muted">
          {payment.order_number} · {formatStatus(payment.payment_method)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-ink">
          {formatMoney(payment.amount, currency)}
        </p>
        <p className="text-xs text-muted">
          {formatDateTime(payment.paid_at, timezone)}
        </p>
      </div>
    </Link>
  );
}

function SummarySkeleton() {
  return (
    <div
      className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Loading dashboard summary"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className="h-40" key={index} />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading dashboard section">
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
