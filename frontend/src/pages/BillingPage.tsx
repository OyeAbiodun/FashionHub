import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { cancelSubscriptionRenewal, getSubscriptionPayments, getSubscriptionStatus } from "../api/subscription";
import { getApiErrorMessage } from "../api/client";
import { Button, Card, InlineError, PageContainer, PageHeader, Skeleton, StatusBadge } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { formatMoney } from "../lib/money";
import { formatDate } from "../lib/date";

const providerNames: Record<string, string> = {
  MANUAL: "Manual / offline billing",
  STRIPE: "Stripe",
  PAYSTACK: "Paystack",
  FLUTTERWAVE: "Flutterwave",
};

export function BillingPage() {
  const { business, user } = useAuth();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["subscription", "status"], queryFn: getSubscriptionStatus });
  const payments = useQuery({ queryKey: ["subscription", "payments"], queryFn: getSubscriptionPayments });
  const cancelMutation = useMutation({
    mutationFn: cancelSubscriptionRenewal,
    onSuccess: async (updated) => {
      queryClient.setQueryData(["subscription", "status"], updated);
      await queryClient.invalidateQueries({ queryKey: ["subscription", "payments"] });
    },
  });
  const plan = status.data?.selected_plan;
  const provider = status.data?.billing_provider ?? "MANUAL";
  const renewable = status.data?.can_cancel_renewal === true
    && ["OWNER", "BUSINESS_ADMIN", "SUPER_ADMIN"].includes(user?.role ?? "")
    && ["ACTIVE", "PAST_DUE"].includes(status.data?.subscription_status ?? "")
    && !status.data?.cancel_at_period_end;

  return <PageContainer>
    <PageHeader eyebrow="Business account" title="Plan & billing" description="Review your workspace plan, included features, and billing setup." actions={<Link to="/subscription" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-stone-50">Compare plans<ArrowRight className="h-4 w-4" /></Link>} />
    {status.isLoading ? <div className="mt-7 grid gap-5 lg:grid-cols-3"><Skeleton className="h-52 lg:col-span-2" /><Skeleton className="h-52" /></div> : null}
    {status.isError ? <div className="mt-6"><InlineError message="Billing details could not be loaded. Refresh the page or contact your platform administrator." retry={() => void status.refetch()} /></div> : null}
    {status.data ? <>
      <section className="mt-7 grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-primary-soft/35 p-6 sm:p-7">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Current subscription</p><h2 className="mt-2 text-2xl font-semibold text-ink">{plan?.name ?? "No plan selected"}</h2><p className="mt-1 text-sm text-muted">{business?.name ?? "Your business workspace"}</p></div>
            <StatusBadge status={plan ? "SUCCESSFUL" : "PENDING"} label={plan ? (status.data.required ? "Plan active" : "Plan selected") : "No plan selected"} />
          </div>
          <div className="grid gap-5 p-6 sm:grid-cols-2 sm:p-7">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Plan price</p><p className="mt-2 text-2xl font-semibold text-ink">{plan ? formatMoney(plan.monthly_price, plan.currency) : "—"}<span className="ml-1 text-sm font-normal text-muted">/ month</span></p><p className="mt-1 text-xs text-muted">{plan ? "Monthly plan price. See payment history for confirmed charges." : "Choose a plan to see its price and features."}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">Staff accounts</p><p className="mt-2 text-2xl font-semibold text-ink">{plan?.max_staff_users ?? "—"}</p><p className="mt-1 text-xs text-muted">Maximum team accounts included in this plan.</p></div>
            <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Included features</p>{plan?.features.length ? <div className="mt-3 flex flex-wrap gap-2">{plan.features.map((feature) => <span className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium capitalize text-ink" key={feature}>{feature.replace(/_/g, " ")}</span>)}</div> : <p className="mt-2 text-sm text-muted">No plan features to display.</p>}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5 sm:px-7">
            <p className="text-xs text-muted">Plan selected {status.data.selected_at ? formatDate(status.data.selected_at, business?.timezone) : "—"}</p>
            <div className="flex flex-wrap items-center gap-4">
              {status.data.cancel_at_period_end && status.data.period_end ? <span className="text-sm text-amber-800">Renewal cancelled · access through {formatDate(status.data.period_end, business?.timezone)}</span> : null}
              {renewable ? <Button variant="outline" size="sm" disabled={cancelMutation.isPending} onClick={() => {
                if (window.confirm("Cancel automatic renewal? Your business will keep access until the paid period ends.")) cancelMutation.mutate();
              }}>{cancelMutation.isPending ? "Scheduling…" : "Cancel renewal"}</Button> : null}
              {status.data.automatic_renewal && !status.data.can_cancel_renewal && !status.data.cancel_at_period_end ? <span className="text-xs text-muted">Renewal details are syncing with {providerNames[provider] ?? provider}.</span> : null}
              <Link to="/subscription" className="text-sm font-semibold text-primary hover:underline">Change plan</Link>
            </div>
          </div>
          {cancelMutation.isError ? <div className="px-6 pb-5 sm:px-7"><InlineError message={getApiErrorMessage(cancelMutation.error)} /></div> : null}
        </Card>
        <Card className="p-6 sm:p-7">
          <span className="inline-flex rounded-xl bg-primary-soft p-3 text-primary"><CreditCard className="h-5 w-5" /></span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Billing provider</p>
          <h2 className="mt-2 text-lg font-semibold text-ink">{providerNames[provider] ?? provider}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Environment: <strong className="font-semibold text-ink">{status.data.billing_mode}</strong></p>
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Checkout uses the platform selected gateway. Plan access changes only after FashionOS confirms payment directly with that provider. Paid monthly plans automatically renew through {providerNames[provider] ?? provider} until cancelled. The gateway manages recurring charges and will send FashionOS payment updates.</div>
          <p className="mt-4 text-xs leading-5 text-muted">Your platform administrator manages the provider. Contact them if your plan or billing details need correction.</p>
        </Card>
      </section>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Card className="flex items-start gap-3 p-5"><ReceiptText className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h3 className="font-semibold text-ink">Subscription payment history</h3><p className="mt-1 text-sm leading-6 text-muted">Recent checkout attempts and confirmed plan periods.</p>{payments.isLoading ? <p className="mt-3 text-sm text-muted">Loading payment history…</p> : payments.isError ? <p className="mt-3 text-sm text-red-700">Payment history could not be loaded.</p> : payments.data?.length ? <ul className="mt-3 divide-y divide-border">{payments.data.map((payment) => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={payment.reference}><div><p className="text-sm font-medium text-ink">{payment.plan_name} · {payment.provider}</p><p className="text-xs text-muted">Ref {payment.reference}{payment.period_end ? ` · Access through ${formatDate(payment.period_end, business?.timezone)}` : ""}</p></div><span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-ink">{payment.status} · {formatMoney(payment.amount, payment.currency)}</span></li>)}</ul> : <p className="mt-2 text-xs font-medium text-muted">No subscription payment attempts yet.</p>}</div></Card>
        <Card className="flex items-start gap-3 p-5"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h3 className="font-semibold text-ink">Secure account access</h3><p className="mt-1 text-sm leading-6 text-muted">Your selected plan controls available workspace modules when subscription access is enabled by the platform.</p><p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"><BadgeCheck className="h-3.5 w-3.5" /> Managed by FashionOS</p></div></Card>
      </div>
    </> : null}
  </PageContainer>;
}
