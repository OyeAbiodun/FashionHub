import { ArrowRight, ClipboardList, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  EmptyState,
  InlineError,
  LoadingBlock,
  SectionHeader,
  StatusBadge,
  buttonStyles,
} from "./ui";
import { useCustomerOrders } from "../hooks/useOrders";
import { formatDate } from "../lib/date";
import { overdueText } from "../lib/orders";

export function CustomerOrdersSection({ customerId }: { customerId: string }) {
  const query = useCustomerOrders(customerId);
  const orders = query.data?.items ?? [];

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        title="Orders"
        description="Recent production work for this customer."
        action={
          <Link
            className={buttonStyles({ size: "sm" })}
            to={`/orders/new?customerId=${customerId}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Create Order
          </Link>
        }
      />
      <div className="mt-5">
        {query.isLoading ? (
          <LoadingBlock label="Loading customer orders" />
        ) : null}
        {query.isError ? (
          <InlineError
            message="Could not load orders."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No orders yet for this customer."
            description="Create an order when this customer is ready to begin a garment."
            compact
          />
        ) : null}
        {orders.length > 0 ? (
          <div className="divide-y divide-border">
            {orders.map((order) => (
              <Link
                key={order.id}
                className="group flex items-center gap-3 py-4 first:pt-0 last:pb-0"
                to={`/orders/${order.id}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-muted">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink group-hover:text-primary">
                      {order.order_number}
                    </p>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">
                    {order.garment_summary} · Due {formatDate(order.due_date)}
                  </p>
                  {order.is_overdue ? (
                    <p className="mt-1 text-xs font-semibold text-danger">
                      {overdueText(order.overdue_days)}
                    </p>
                  ) : null}
                </div>
                <ArrowRight
                  className="h-4 w-4 text-stone-300 group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
