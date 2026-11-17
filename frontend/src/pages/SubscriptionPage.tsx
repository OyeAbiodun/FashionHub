import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CreditCard, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { getSubscriptionStatus, selectSubscriptionPlan, startSubscriptionCheckout } from "../api/subscription";
import { Button, Card, InlineError, PageContainer, PageHeader, Skeleton } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { formatMoney } from "../lib/money";
import type { SubscriptionPlan } from "../types/subscription";

const featureLabels: Record<string, string> = {
  customers: "Customer records", measurements: "Measurements", templates: "Measurement templates",
  orders: "Order management", invoices: "Payments and invoices", reports: "Business reports",
  team: "Team accounts", tasks: "Tasks", installment_plans: "Installment plans",
  audit: "Business audit log", inventory: "Inventory", communication: "Customer communication",
};

export function SubscriptionPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState("");
  const { user } = useAuth();
  const status = useQuery({ queryKey: ["subscription", "status"], queryFn: getSubscriptionStatus });
  const selectMutation = useMutation({
    mutationFn: selectSubscriptionPlan,
    onSuccess: async (result) => {
      client.setQueryData(["subscription", "status"], result);
      await client.invalidateQueries({ queryKey: ["auth", "session"] });
      navigate("/billing", { replace: true });
    },
  });
  const checkoutMutation = useMutation({
    mutationFn: startSubscriptionCheckout,
    onSuccess: (checkout) => { window.location.assign(checkout.checkout_url); },
  });
  const canManage = ["OWNER", "BUSINESS_ADMIN"].includes(user?.role ?? "");

  function choosePlan(plan: SubscriptionPlan) {
    setSelectedPlan(plan.id);
    if (Number(plan.monthly_price) > 0) checkoutMutation.mutate(plan.id);
    else selectMutation.mutate(plan.id);
  }

  return (
    <PageContainer>
      <Link to="/billing" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Back to plan &amp; billing</Link>
      <PageHeader eyebrow="Workspace plan" title="Choose the right plan for your business" description="Compare included tools and staff access. Your business owner can change the selected plan later." />
      {status.isLoading ? <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div> : null}
      {status.isError ? <div className="mt-6"><InlineError message="Plans could not be loaded. Refresh the page or ask the platform administrator to check subscription setup." retry={() => void status.refetch()} /></div> : null}
      {selectMutation.isError ? <div className="mt-6"><InlineError message={getApiErrorMessage(selectMutation.error)} /></div> : null}
      {checkoutMutation.isError ? <div className="mt-6"><InlineError message={getApiErrorMessage(checkoutMutation.error)} /></div> : null}
      {status.data?.selected_plan ? <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-primary/20 bg-primary-soft/40 p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Current plan</p><h2 className="mt-1 text-lg font-semibold text-ink">{status.data.selected_plan.name}</h2><p className="mt-1 text-sm text-muted">{formatMoney(status.data.selected_plan.monthly_price, status.data.selected_plan.currency)} / month · {status.data.selected_plan.max_staff_users} staff accounts</p><p className="mt-1 text-xs text-muted">{status.data.can_use_app ? "Plan access is active." : "Payment or renewal is required to restore plan access."}</p></div><Link to="/billing" className="text-sm font-semibold text-primary hover:underline">View billing overview</Link></Card> : null}
      {status.data?.plans.length ? <div className="mt-6 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        {status.data.plans.map((plan) => {
          const current = status.data?.selected_plan?.id === plan.id;
          return <Card key={plan.id} className={`flex flex-col p-6 ${current ? "border-primary ring-1 ring-primary/20" : ""}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-semibold text-ink">{plan.name}</p><p className="mt-2 min-h-12 text-sm leading-6 text-muted">{plan.description || "Tools to run your fashion business."}</p></div><span className="rounded-xl bg-primary-soft p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></span></div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-ink">{formatMoney(plan.monthly_price, plan.currency)}<span className="ml-1 text-sm font-medium text-muted">/ month</span></p>
            <p className="mt-5 border-t border-border pt-4 text-sm font-semibold text-ink">Includes {plan.max_staff_users} staff accounts</p>
            <ul className="mt-3 flex-1 space-y-3 text-sm text-muted">{plan.features.map((feature) => <li className="flex items-start gap-2" key={feature}><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{featureLabels[feature] ?? feature.replace(/_/g, " ")}</li>)}</ul>
            <Button className="mt-6 w-full" variant={current ? "secondary" : "primary"} disabled={current || selectMutation.isPending || checkoutMutation.isPending || !canManage} onClick={() => choosePlan(plan)}>{current ? "Current plan" : checkoutMutation.isPending && selectedPlan === plan.id ? "Preparing checkout…" : selectMutation.isPending && selectedPlan === plan.id ? "Updating plan…" : Number(plan.monthly_price) > 0 ? "Continue to payment" : "Select free plan"}</Button>
          </Card>;
        })}
      </div> : null}
      {status.data && status.data.plans.length === 0 ? <Card className="mx-auto mt-8 max-w-2xl p-6"><h2 className="font-semibold text-ink">Plans are not available yet</h2><p className="mt-2 text-sm leading-6 text-muted">A platform administrator needs to publish an active plan before a plan can be selected.</p></Card> : null}
      {!canManage ? <Card className="mx-auto mt-6 max-w-2xl p-4 text-sm text-muted">Ask your business owner or administrator to change the workspace plan.</Card> : null}
      <Card className="mt-6 flex items-start gap-3 border-border bg-white p-4"><CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-6 text-muted">Paid plans use the gateway configured by FashionOS. Access starts after the provider confirms payment. Stripe renews monthly automatically; Paystack and Flutterwave plans currently need a new checkout at renewal. See <Link className="font-semibold text-primary hover:underline" to="/billing">Plan &amp; Billing</Link> for payment history.</p></Card>
    </PageContainer>
  );
}
