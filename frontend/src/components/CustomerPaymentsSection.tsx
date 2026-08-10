import { ArrowRight, Banknote } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  EmptyState,
  InlineError,
  LoadingBlock,
  SectionHeader,
  StatusBadge,
} from "./ui";
import { useCustomerPayments } from "../hooks/usePayments";
import { formatDateTime } from "../lib/date";
import { formatMoney } from "../lib/money";
import { formatStatus } from "../lib/orders";
import { useAuth } from "../hooks/useAuth";

export function CustomerPaymentsSection({
  customerId,
}: {
  customerId: string;
}) {
  const { business } = useAuth();
  const currency = business?.currency ?? "NGN";
  const paymentsQuery = useCustomerPayments(customerId);

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        title="Payments"
        description="Successful payments recorded across this customer’s orders."
      />
      <div className="mt-5">
        {paymentsQuery.isLoading ? (
          <LoadingBlock label="Loading customer payments" />
        ) : null}
        {paymentsQuery.isError ? (
          <InlineError
            message="Could not load payments."
            retry={() => void paymentsQuery.refetch()}
          />
        ) : null}
        {paymentsQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No payments recorded for this customer yet."
            description="Payments recorded against their orders will appear here."
            compact
          />
        ) : null}
        <div className="divide-y divide-border">
          {paymentsQuery.data?.items.map((payment) => (
            <Link
              className="group flex items-center gap-3 py-4 first:pt-0 last:pb-0"
              key={payment.id}
              to={`/orders/${payment.order_id}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Banknote className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">
                    {formatMoney(payment.amount, currency)}
                  </p>
                  <StatusBadge status={payment.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {formatStatus(payment.payment_method)} ·{" "}
                  {payment.order_number}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted">
                  {formatDateTime(payment.paid_at, business?.timezone)}
                </p>
                <ArrowRight
                  className="ml-auto mt-2 h-4 w-4 text-stone-300 group-hover:text-primary"
                  aria-hidden="true"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
