import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Check, Power, Save, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { fetchAdminBusiness, toggleBusinessActive, updateBusinessEntitlements } from "../api/admin";
import { getApiErrorMessage } from "../api/client";
import { Button, Card, Dialog, InlineError, PageContainer, PageHeader, StatusBadge, inputStyles } from "../components/ui";

const modules = ["customers", "measurements", "templates", "orders", "invoices", "reports", "team", "tasks", "installment_plans", "audit", "inventory", "communication"];

export function AdminBusinessDetailPage() {
  const { businessId = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [features, setFeatures] = useState<string[] | null>(null);
  const [staffLimit, setStaffLimit] = useState<number | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const detail = useQuery({ queryKey: ["admin", "business", businessId], queryFn: () => fetchAdminBusiness(businessId), enabled: Boolean(businessId) });
  const tenant = detail.data;
  const enabledFeatures = features ?? tenant?.enabled_features ?? [];
  const currentLimit = staffLimit ?? tenant?.max_staff_users ?? 1;
  const saveMutation = useMutation({
    mutationFn: () => updateBusinessEntitlements(businessId, { enabled_features: enabledFeatures, max_staff_users: currentLimit }),
    onSuccess: async (updated) => { await client.setQueryData(["admin", "business", businessId], updated); setFeatures(null); setStaffLimit(null); await client.invalidateQueries({ queryKey: ["admin", "businesses"] }); await client.invalidateQueries({ queryKey: ["admin", "metrics"] }); },
  });
  const toggleMutation = useMutation({
    mutationFn: () => toggleBusinessActive(businessId),
    onSuccess: async (updated) => { await client.setQueryData(["admin", "business", businessId], updated); setConfirmSuspend(false); await client.invalidateQueries({ queryKey: ["admin", "businesses"] }); await client.invalidateQueries({ queryKey: ["admin", "metrics"] }); },
  });

  if (detail.isLoading) return <PageContainer><Card className="p-8 text-sm text-muted">Loading business details…</Card></PageContainer>;
  if (detail.isError || !tenant) return <PageContainer><InlineError message="Business details could not be loaded." retry={() => void detail.refetch()} /><Link className="mt-4 inline-block text-sm font-semibold text-primary underline" to="/admin">Back to Super Admin</Link></PageContainer>;

  const contactRows = [["Business email", tenant.email], ["Business phone", tenant.phone], ["Owner name", tenant.owner_name], ["Owner email", tenant.owner_email], ["Owner phone", tenant.owner_phone], ["Business address", tenant.address], ["Currency", tenant.currency], ["Timezone", tenant.timezone], ["Subscription plan", tenant.subscription_plan_id], ["Registered", new Date(tenant.created_at).toLocaleString()]] as const;
  const dirty = JSON.stringify(enabledFeatures) !== JSON.stringify(tenant.enabled_features) || currentLimit !== tenant.max_staff_users;

  return <PageContainer>
    <Link className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink" to="/admin"><ArrowLeft className="h-4 w-4" />Back to business tenants</Link>
    <PageHeader eyebrow="Super Admin · Business tenant" title={tenant.name} description={`Tenant record ${tenant.id}`} actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => document.getElementById("tenant-entitlements")?.scrollIntoView({ behavior: "smooth" })}><ShieldCheck className="h-4 w-4" />Edit entitlements</Button><Button variant={tenant.is_active ? "destructive" : "primary"} onClick={() => setConfirmSuspend(true)}><Power className="h-4 w-4" />{tenant.is_active ? "Suspend business" : "Reactivate business"}</Button></div>} />
    <div className="mt-5 flex flex-wrap items-center gap-3"><StatusBadge status={tenant.is_active ? "ACTIVE" : "CANCELLED"} label={tenant.is_active ? "Active tenant" : "Suspended tenant"} /><span className="text-sm text-muted">{tenant.currency} · {tenant.timezone}</span></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Users", `${tenant.active_user_count} active / ${tenant.user_count} total`], ["Customers", String(tenant.customer_count)], ["Orders", String(tenant.order_count)], ["Successful payments", `${tenant.currency} ${tenant.total_revenue}`]].map(([label, value]) => <Card className="p-4" key={label}><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-lg font-semibold text-ink">{value}</p></Card>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <Card className="overflow-hidden p-0"><div className="border-b border-border px-5 py-4"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><h2 className="font-semibold">Business and owner information</h2></div><p className="mt-1 text-sm text-muted">Full contact and operating profile for this tenant.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><tbody className="divide-y divide-border">{contactRows.map(([label, value]) => <tr key={label}><th className="w-48 bg-stone-50 px-5 py-3 font-medium text-muted">{label}</th><td className="px-5 py-3 break-words text-ink">{value || "Not provided"}</td></tr>)}</tbody></table></div></Card>
      <Card className="p-5"><h2 className="font-semibold">Business audit capture</h2><p className="mt-1 text-sm text-muted">Optional operational data recorded for this workspace.</p><div className="mt-4 space-y-2">{Object.entries(tenant.audit_configuration ?? {}).map(([key, value]) => <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm" key={key}><span className="text-ink">{key.replace(/_/g, " ")}</span><span className={value ? "font-semibold text-emerald-800" : "text-muted"}>{value ? "On" : "Off"}</span></div>)}</div></Card>
    </div>
    <Card id="tenant-entitlements" className="mt-5 p-5 sm:p-6"><h2 className="font-semibold">Plan and feature access</h2><p className="mt-1 text-sm text-muted">Change which modules this business can use and its staff account limit.</p><div className="mt-4 max-w-xs"><label className="text-sm font-medium">Staff account limit<input className={inputStyles} type="number" min={1} max={1000} value={currentLimit} onChange={(event) => setStaffLimit(Number(event.target.value))} /></label></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{modules.map((feature) => <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm" key={feature}><input type="checkbox" checked={enabledFeatures.includes(feature)} onChange={(event) => setFeatures(event.target.checked ? [...enabledFeatures, feature] : enabledFeatures.filter((item) => item !== feature))} /><span className="capitalize">{feature.replace(/_/g, " ")}</span></label>)}</div>{saveMutation.isError ? <div className="mt-4"><InlineError message={getApiErrorMessage(saveMutation.error)} /></div> : null}<div className="mt-5 flex justify-end"><Button disabled={!dirty || enabledFeatures.length === 0 || saveMutation.isPending} onClick={() => saveMutation.mutate()}><Save className="h-4 w-4" />{saveMutation.isPending ? "Saving…" : "Save entitlements"}</Button></div></Card>
    {confirmSuspend ? <Dialog title={tenant.is_active ? "Suspend this business?" : "Reactivate this business?"} description={tenant.is_active ? "Users in this workspace will no longer be able to sign in." : "This business and its users will be able to sign in again."} onClose={() => setConfirmSuspend(false)} footer={<><Button variant="outline" onClick={() => setConfirmSuspend(false)}>Cancel</Button><Button variant={tenant.is_active ? "destructive" : "primary"} disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate()}><Check className="h-4 w-4" />{toggleMutation.isPending ? "Saving…" : tenant.is_active ? "Suspend business" : "Reactivate business"}</Button></>}><p className="text-sm text-muted">{tenant.name}</p>{toggleMutation.isError ? <div className="mt-3"><InlineError message={getApiErrorMessage(toggleMutation.error)} /></div> : null}</Dialog> : null}
  </PageContainer>;
}
