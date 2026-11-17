import { useState } from "react";
import { CalendarDays, Clock3, CreditCard, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";

import type { BusinessPaymentFilters } from "../api/payments";
import { Card, InlineError, MetricCard, PageContainer, PageHeader, Skeleton, StatusBadge } from "../components/ui";
import { useBusinessPaymentSummary, useBusinessPayments } from "../hooks/usePayments";
import { formatDateTime } from "../lib/date";
import { formatMoney } from "../lib/money";
import { useAuth } from "../hooks/useAuth";
import { formatStatus } from "../lib/orders";

type PaymentKpi = "successful" | "today" | "month" | "pending";

export function PaymentsPage() {
  const { business } = useAuth();
  const currency = business?.currency ?? "NGN";
  const summary = useBusinessPaymentSummary();
  const [activeKpi, setActiveKpi] = useState<PaymentKpi>("successful");
  const summaryData = summary.data;
  const filters: BusinessPaymentFilters = activeKpi === "pending"
    ? { status: "PENDING" }
    : activeKpi === "today" && summaryData
      ? { status: "SUCCESSFUL", start_at: summaryData.today_start, end_at: summaryData.tomorrow_start }
      : activeKpi === "month" && summaryData
        ? { status: "SUCCESSFUL", start_at: summaryData.month_start, end_at: summaryData.next_month_start }
        : { status: "SUCCESSFUL" };
  const payments = useBusinessPayments(filters);

  return (
    <PageContainer>
      <PageHeader title="Payments" description="Track received money, daily collections, and pending payments across your orders." />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Received to date" value={summaryData ? formatMoney(summaryData.successful_amount, currency) : "—"} subtext={`${summaryData?.successful_count ?? 0} successful payments · View all`} icon={DollarSign} onClick={() => setActiveKpi("successful")} active={activeKpi === "successful"} />
        <MetricCard label="Received today" value={summaryData ? formatMoney(summaryData.today_amount, currency) : "—"} subtext={`${summaryData?.today_count ?? 0} payments · View today`} icon={CalendarDays} onClick={() => setActiveKpi("today")} active={activeKpi === "today"} />
        <MetricCard label="Received this month" value={summaryData ? formatMoney(summaryData.month_amount, currency) : "—"} subtext={`${summaryData?.month_count ?? 0} payments · View month`} icon={CreditCard} onClick={() => setActiveKpi("month")} active={activeKpi === "month"} />
        <MetricCard label="Pending payments" value={summaryData ? String(summaryData.pending_count) : "—"} subtext="View pending records" icon={Clock3} onClick={() => setActiveKpi("pending")} active={activeKpi === "pending"} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-ink">{activeKpi === "today" ? "Successful payments received today" : activeKpi === "month" ? "Successful payments received this month" : activeKpi === "pending" ? "Pending payment records" : "Successful payments"}</h2>
          <p className="mt-1 text-xs text-muted">Summary totals are calculated across the full business history. The list shows the latest 20 matching records.</p>
        </div>
        {summary.isError ? <div className="p-5"><InlineError message="Payment summaries could not be loaded." /></div> : null}
        {payments.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : null}
        {payments.isError ? <div className="p-5"><InlineError message="Payments could not be loaded." /></div> : null}
        {payments.data && payments.data.items.length === 0 ? <p className="p-6 text-sm text-muted">No payments match this summary.</p> : null}
        {payments.data && payments.data.items.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase text-muted"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Order</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Allocation</th><th className="px-5 py-3 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-border">{payments.data.items.map((payment) => <tr key={payment.id}><td className="px-5 py-4">{formatDateTime(payment.paid_at, business?.timezone)}</td><td className="px-5 py-4">{payment.customer_name}</td><td className="px-5 py-4"><Link className="font-semibold text-primary hover:underline" to={`/orders/${payment.order_id}`}>{payment.order_number}</Link></td><td className="px-5 py-4">{formatStatus(payment.payment_method)}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-1">{payment.allocations?.length ? payment.allocations.map((allocation, index) => <StatusBadge key={`${payment.id}-${index}`} status={payment.status} label={allocation.label} />) : <span className="text-muted">General balance</span>}</div></td><td className="px-5 py-4 text-right font-semibold">{formatMoney(payment.amount, currency)}</td></tr>)}</tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">{payments.data.items.map((payment) => <li className="space-y-2 p-4" key={payment.id}><div className="flex justify-between gap-2"><strong>{formatMoney(payment.amount, currency)}</strong><span className="text-xs text-muted">{formatDateTime(payment.paid_at, business?.timezone)}</span></div><p className="text-sm">{payment.customer_name ?? "Customer"} · <Link className="text-primary" to={`/orders/${payment.order_id}`}>{payment.order_number}</Link></p><p className="text-xs text-muted">{formatStatus(payment.payment_method)}{payment.allocations?.length ? ` · ${payment.allocations.map((item) => item.label).join(", ")}` : " · General balance"}</p></li>)}</ul>
          </>
        ) : null}
      </Card>
    </PageContainer>
  );
}
