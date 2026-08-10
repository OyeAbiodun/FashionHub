import { ArrowRight, ClipboardList, Plus, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  AvatarInitials,
  Card,
  EmptyState,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
  StatusBadge,
  buttonStyles,
  inputStyles,
} from "../components/ui";
import { useOrders } from "../hooks/useOrders";
import { useAuth } from "../hooks/useAuth";
import { formatDate } from "../lib/date";
import { formatMoney } from "../lib/money";
import { ORDER_STATUSES, formatStatus, overdueText } from "../lib/orders";
import type { OrderListItem, OrderStatus } from "../types/order";

export function OrdersPage() {
  const { business } = useAuth();
  const currency = business?.currency ?? "NGN";
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const initialDue = searchParams.get("due");
  const [due, setDue] = useState(
    ["today", "tomorrow", "this_week", "overdue", "upcoming"].includes(
      initialDue ?? "",
    )
      ? (initialDue ?? "")
      : "",
  );
  const [page, setPage] = useState(1);
  const query = useOrders({
    search: search || undefined,
    status: status || undefined,
    due: (due || undefined) as
      "today" | "tomorrow" | "this_week" | "overdue" | "upcoming" | undefined,
    page,
    page_size: 10,
  });
  const orders = query.data?.items ?? [];

  useEffect(() => setPage(1), [search, status, due]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  const filtered = Boolean(search || status || due);
  const empty = !query.isLoading && !query.isError && orders.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Orders"
        description="Track production from confirmation through delivery."
        actions={
          <Link className={buttonStyles()} to="/orders/new">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create Order
          </Link>
        }
      />

      <Card className="mt-7 p-4 sm:p-5">
        <form
          className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px_auto] md:items-end"
          onSubmit={submitSearch}
        >
          <label>
            <span className="sr-only">Search orders</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                className={`${inputStyles} mt-0 pl-10`}
                placeholder="Order number, customer, phone…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </span>
          </label>
          <label>
            <span className="sr-only">Status</span>
            <select
              className={`${inputStyles} mt-0`}
              value={status}
              aria-label="Status"
              onChange={(event) =>
                setStatus(event.target.value as OrderStatus | "")
              }
            >
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {formatStatus(option)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Due</span>
            <select
              className={`${inputStyles} mt-0`}
              value={due}
              aria-label="Due"
              onChange={(event) => setDue(event.target.value)}
            >
              <option value="">Any due date</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="this_week">This week</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </label>
          <button
            className={buttonStyles({ variant: "outline" })}
            type="submit"
          >
            Search
          </button>
        </form>
      </Card>

      {query.isLoading ? (
        <div className="mt-6 space-y-3" aria-label="Loading orders">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : null}
      {query.isError ? (
        <div className="mt-6">
          <InlineError
            message="We couldn’t load your orders."
            retry={() => void query.refetch()}
          />
        </div>
      ) : null}
      {empty ? (
        <Card className="mt-6 border-dashed">
          <EmptyState
            icon={ClipboardList}
            title={
              filtered ? "No orders matched your filters." : "No orders yet"
            }
            description={
              filtered
                ? "Try changing your search, status, or due-date filters."
                : "Create your first order to start tracking production through delivery."
            }
            action={
              !filtered ? (
                <Link className={buttonStyles()} to="/orders/new">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Create Order
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <Card className="mt-6 overflow-hidden">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-stone-50/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Garments</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Due</th>
                  <th className="px-5 py-3 text-right font-semibold">
                    Balance
                  </th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <OrderTableRow
                    order={order}
                    currency={currency}
                    key={order.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border lg:hidden">
            {orders.map((order) => (
              <OrderMobileCard
                order={order}
                currency={currency}
                key={order.id}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {query.data && query.data.total_pages > 1 ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            className={buttonStyles({ variant: "outline", size: "sm" })}
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-muted">
            Page {query.data.page} of {query.data.total_pages}
          </span>
          <button
            className={buttonStyles({ variant: "outline", size: "sm" })}
            type="button"
            disabled={page >= query.data.total_pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </PageContainer>
  );
}

function OrderTableRow({
  order,
  currency,
}: {
  order: OrderListItem;
  currency: string;
}) {
  return (
    <tr className="group hover:bg-stone-50/70">
      <td className="px-5 py-4">
        <Link
          className="font-semibold text-ink group-hover:text-primary"
          to={`/orders/${order.id}`}
        >
          {order.order_number}
        </Link>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <AvatarInitials name={order.customer_name} size="sm" />
          <div>
            <p className="font-medium text-ink">{order.customer_name}</p>
            <p className="text-xs text-muted">{order.customer_phone}</p>
          </div>
        </div>
      </td>
      <td className="max-w-48 px-5 py-4">
        <p className="truncate text-ink">{order.garment_summary}</p>
        <p className="mt-0.5 text-xs text-muted">
          {order.item_count} item{order.item_count === 1 ? "" : "s"}
        </p>
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-5 py-4">
        <p
          className={
            order.is_overdue ? "font-semibold text-danger" : "text-ink"
          }
        >
          {formatDate(order.due_date)}
        </p>
        {order.is_overdue ? (
          <p className="mt-0.5 text-xs font-semibold text-danger">
            {overdueText(order.overdue_days)}
          </p>
        ) : null}
      </td>
      <td className="px-5 py-4 text-right font-semibold text-ink">
        {formatMoney(order.outstanding_balance, currency)}
      </td>
      <td className="px-5 py-4 text-right">
        <Link
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          to={`/orders/${order.id}`}
        >
          View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function OrderMobileCard({
  order,
  currency,
}: {
  order: OrderListItem;
  currency: string;
}) {
  return (
    <Link className="block p-4" to={`/orders/${order.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{order.order_number}</p>
          <p className="mt-1 text-sm text-muted">{order.customer_name}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-3 text-sm text-ink">
        {order.garment_summary} · {order.item_count} item
        {order.item_count === 1 ? "" : "s"}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-stone-50 p-3 text-sm">
        <div>
          <p className="text-xs text-muted">Due date</p>
          <p
            className={
              order.is_overdue
                ? "mt-1 font-semibold text-danger"
                : "mt-1 font-medium text-ink"
            }
          >
            {order.is_overdue
              ? overdueText(order.overdue_days)
              : formatDate(order.due_date)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Outstanding</p>
          <p className="mt-1 font-semibold text-ink">
            {formatMoney(order.outstanding_balance, currency)}
          </p>
        </div>
      </div>
      <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        View Order <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </p>
    </Link>
  );
}
