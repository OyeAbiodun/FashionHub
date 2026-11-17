import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchAdminBusinesses,
  fetchPlatformSubscriptionConfiguration,
  testBillingProviderConnection,
  updatePlatformSubscriptionConfiguration,
} from "../../api/admin";
import { getApiErrorMessage } from "../../api/client";
import {
  Button,
  Card,
  InlineError,
  SectionHeader,
  SuccessNotice,
  inputStyles,
  labelStyles,
} from "../../components/ui";
import type {
  PlatformSubscriptionConfiguration,
  BillingProviderTestResult,
  PlatformSubscriptionConfigurationUpdate,
  SubscriptionPlan,
} from "../../types/subscription";

const emptyPlan = (): SubscriptionPlan => ({
  id: "",
  name: "",
  description: "",
  monthly_price: "0.00",
  currency: "NGN",
  features: [],
  max_staff_users: 10,
  is_active: true,
});

const PLAN_FEATURES = [
  ["customers", "Customers"],
  ["measurements", "Measurements"],
  ["templates", "Measurement templates"],
  ["orders", "Orders"],
  ["invoices", "Payments & invoices"],
  ["reports", "Reports"],
  ["team", "Team management"],
  ["tasks", "Tasks"],
  ["installment_plans", "Installment plans"],
  ["audit", "Business audit"],
  ["inventory", "Inventory"],
  ["communication", "Communication"],
] as const;

type AdminTab = "plans" | "provider" | "test" | "businesses";
const PAYMENT_METHODS: Record<
  PlatformSubscriptionConfiguration["billing_provider"],
  Array<{ id: string; label: string }>
> = {
  MANUAL: [],
  STRIPE: [
    { id: "CARD", label: "Card payment" },
    { id: "BANK_TRANSFER", label: "Bank transfer" },
  ],
  PAYSTACK: [
    { id: "CARD", label: "Card payment" },
    { id: "BANK_TRANSFER", label: "Bank transfer" },
    { id: "USSD", label: "USSD" },
  ],
  FLUTTERWAVE: [
    { id: "CARD", label: "Card payment" },
    { id: "BANK_TRANSFER", label: "Bank transfer" },
    { id: "USSD", label: "USSD" },
    { id: "MOBILE_MONEY", label: "Mobile money" },
  ],
};

const tabs: Array<{ id: AdminTab; label: string; icon: typeof ShieldCheck }> = [
  { id: "plans", label: "Plans & access", icon: ShieldCheck },
  { id: "provider", label: "Billing provider", icon: Settings2 },
  { id: "test", label: "Payment test", icon: CreditCard },
  { id: "businesses", label: "Business plans", icon: Users },
];

export function SubscriptionSettingsPanel() {
  const client = useQueryClient();
  const configQuery = useQuery({
    queryKey: ["admin", "subscription-configuration"],
    queryFn: fetchPlatformSubscriptionConfiguration,
  });
  const businessesQuery = useQuery({
    queryKey: ["admin", "businesses", "subscription-overview"],
    queryFn: () => fetchAdminBusinesses({ page: 1, page_size: 100 }),
  });
  const [draft, setDraft] = useState<PlatformSubscriptionConfiguration>({
    enabled: false,
    plans: [],
    billing_provider: "MANUAL",
    billing_mode: "TEST",
    billing_secret_configured: false,
    billing_webhook_secret_configured: false,
    provider_credentials: {},
  });
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("plans");
  const [testMethod, setTestMethod] = useState("CARD");
  const [testAmount, setTestAmount] = useState("1000");
  const [testResult, setTestResult] = useState<"success" | "declined" | null>(
    null,
  );
  const [confirmError, setConfirmError] = useState("");
  const [billingSecret, setBillingSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [providerTestResult, setProviderTestResult] = useState<BillingProviderTestResult | null>(null);
  const [providerTestFingerprint, setProviderTestFingerprint] = useState("");
  const providerTestRequestFingerprint = `${draft.billing_provider}:${draft.billing_mode}:${billingSecret.trim() || "saved"}`;
  const providerTestMutation = useMutation({
    mutationFn: testBillingProviderConnection,
    onSuccess: (result) => {
      setProviderTestResult(result);
      setProviderTestFingerprint(providerTestRequestFingerprint);
      setConfirmError("");
      void client.invalidateQueries({ queryKey: ["admin", "subscription-configuration"] });
    },
  });

  useEffect(() => {
    if (configQuery.data) setDraft(configQuery.data);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: updatePlatformSubscriptionConfiguration,
    onSuccess: async (result) => {
      setDraft(result);
      setBillingSecret("");
      setWebhookSecret("");
      setProviderTestResult(null);
      setProviderTestFingerprint("");
      setSaved(true);
      await client.invalidateQueries({
        queryKey: ["admin", "subscription-configuration"],
      });
    },
  });

  const tenants = businessesQuery.data?.items ?? [];
  const activePlanIds = new Set(
    draft.plans.filter((plan) => plan.is_active).map((plan) => plan.id),
  );
  const unassignedCount = tenants.filter(
    (business) =>
      !business.subscription_plan_id ||
      !activePlanIds.has(business.subscription_plan_id),
  ).length;

  function updatePlan(index: number, values: Partial<SubscriptionPlan>) {
    setDraft((current) => ({
      ...current,
      plans: current.plans.map((plan, planIndex) =>
        planIndex === index ? { ...plan, ...values } : plan,
      ),
    }));
    setSaved(false);
  }

  function save() {
    const providerChanged =
      draft.billing_provider !== "MANUAL" &&
      configQuery.data &&
      (draft.billing_provider !== configQuery.data.billing_provider ||
        draft.billing_mode !== configQuery.data.billing_mode);
    const keyChanged = Boolean(billingSecret.trim());
    const needsConnectionTest = Boolean(providerChanged || keyChanged);
    const currentFingerprint = `${draft.billing_provider}:${draft.billing_mode}:${billingSecret.trim() || "saved"}`;
    if (draft.billing_provider !== "MANUAL" && needsConnectionTest && (!providerTestResult?.connected || providerTestFingerprint !== currentFingerprint)) {
      setConfirmError(
        "Test the selected provider and exact key before confirming these settings.",
      );
      setActiveTab("provider");
      return;
    }
    setConfirmError("");
    setSaved(false);
    const update: PlatformSubscriptionConfigurationUpdate = { ...draft };
    if (keyChanged) update.billing_secret = billingSecret.trim();
    if (webhookSecret.trim()) update.billing_webhook_secret = webhookSecret.trim();
    saveMutation.mutate(update);
  }

  return (
    <div className="mt-6 space-y-6">
      {configQuery.isLoading ? (
        <Card className="p-6">
          <p className="text-sm text-muted">Loading subscription settings…</p>
        </Card>
      ) : null}
      {configQuery.isError ? (
        <InlineError
          message="Subscription settings could not be loaded."
          retry={() => void configQuery.refetch()}
        />
      ) : null}

      <div
        className="flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="Subscription administration"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`subscription-panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${activeTab === id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "plans" ? (
        <div id="subscription-panel-plans" role="tabpanel" className="space-y-6">
          <Card className="p-5 sm:p-7">
            <SectionHeader
              title="Subscription access control"
              description="The platform-wide gate is off by default. Only a Super Admin can enable or disable it."
            />
            <label className="mt-5 flex items-start gap-3 rounded-xl border border-border p-4">
              <input
                className="mt-1 h-4 w-4"
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }));
                  setSaved(false);
                  setConfirmError("");
                }}
              />
              <span>
                <span className="block text-sm font-semibold text-ink">
                  Require every business to choose an active plan
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted">
                  When enabled, businesses without a selected active plan can
                  access only plan selection and account session endpoints.
                </span>
              </span>
            </label>
            {draft.enabled && unassignedCount > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {unassignedCount} of {tenants.length} listed businesses do not
                have a selection matching an active plan and will be sent to
                plan selection when this gate is enabled.
              </div>
            ) : null}
          </Card>

          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeader
                title="Plan catalog"
                description="Set plan names, prices, module access, and staff limits for business owners."
              />
              <Button
                variant="outline"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    plans: [...current.plans, emptyPlan()],
                  }));
                  setSaved(false);
                }}
              >
                <Plus className="h-4 w-4" /> Add plan
              </Button>
            </div>
            <div className="mt-5 space-y-4">
              {draft.plans.map((plan, index) => (
                <div
                  className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 xl:grid-cols-6"
                  key={plan.id || `draft-${index}`}
                >
                  <label>
                    <span className={labelStyles}>Plan ID</span>
                    <input
                      className={inputStyles}
                      placeholder="studio"
                      value={plan.id}
                      onChange={(event) =>
                        updatePlan(index, {
                          id: event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_-]/g, "-"),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className={labelStyles}>Plan name</span>
                    <input
                      className={inputStyles}
                      placeholder="Studio"
                      value={plan.name}
                      onChange={(event) =>
                        updatePlan(index, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className="xl:col-span-2">
                    <span className={labelStyles}>Description</span>
                    <input
                      className={inputStyles}
                      placeholder="For growing tailoring teams"
                      value={plan.description}
                      onChange={(event) =>
                        updatePlan(index, { description: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className={labelStyles}>Monthly price</span>
                    <input
                      className={inputStyles}
                      type="number"
                      min="0"
                      step="0.01"
                      value={plan.monthly_price}
                      onChange={(event) =>
                        updatePlan(index, { monthly_price: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className={labelStyles}>Currency</span>
                    <select
                      className={inputStyles}
                      value={plan.currency}
                      onChange={(event) =>
                        updatePlan(index, { currency: event.target.value })
                      }
                    >
                      {["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"].map(
                        (currency) => <option key={currency}>{currency}</option>,
                      )}
                    </select>
                  </label>
                  <label>
                    <span className={labelStyles}>Staff account limit</span>
                    <input
                      className={inputStyles}
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      value={plan.max_staff_users}
                      onChange={(event) =>
                        updatePlan(index, {
                          max_staff_users: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="flex h-10 items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={plan.is_active}
                        onChange={(event) =>
                          updatePlan(index, { is_active: event.target.checked })
                        }
                      />
                      Active
                    </label>
                    <Button
                      variant="ghost"
                      aria-label={`Remove ${plan.name || "plan"}`}
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          plans: current.plans.filter(
                            (_, planIndex) => planIndex !== index,
                          ),
                        }));
                        setSaved(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-700" />
                    </Button>
                  </div>
                  <fieldset className="rounded-lg border border-border p-3 sm:col-span-2 xl:col-span-6">
                    <legend className="px-1 text-xs font-semibold text-ink">
                      Features included in this plan
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {PLAN_FEATURES.map(([feature, label]) => (
                        <label
                          key={feature}
                          className="flex items-center gap-2 text-sm text-muted"
                        >
                          <input
                            type="checkbox"
                            checked={plan.features.includes(feature)}
                            onChange={(event) =>
                              updatePlan(index, {
                                features: event.target.checked
                                  ? [...new Set([...plan.features, feature])]
                                  : plan.features.filter(
                                      (item) => item !== feature,
                                    ),
                              })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {plan.features.length} features selected. Active plans
                      need at least one feature.
                    </p>
                  </fieldset>
                </div>
              ))}
              {draft.plans.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">
                  No plans yet. Add and save at least one active plan before
                  turning subscription enforcement on.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "provider" ? (
        <Card
          id="subscription-panel-provider"
          role="tabpanel"
          className="p-5 sm:p-7"
        >
          <SectionHeader
            title="Billing provider"
            description="Choose the gateway and environment for paid plan checkout."
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className={labelStyles}>Provider</span>
              <select
                className={inputStyles}
                value={draft.billing_provider}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    billing_provider: event.target.value as PlatformSubscriptionConfiguration["billing_provider"],
                  }));
                  setTestMethod("CARD");
                  setTestResult(null);
                  setProviderTestResult(null);
                  setProviderTestFingerprint("");
                  setBillingSecret("");
                  setWebhookSecret("");
                  setSaved(false);
                  setConfirmError("");
                }}
              >
                <option value="MANUAL">Manual / offline billing</option>
                <option value="PAYSTACK">Paystack</option>
                <option value="FLUTTERWAVE">Flutterwave</option>
                <option value="STRIPE">Stripe</option>
              </select>
            </label>
            <label>
              <span className={labelStyles}>Environment</span>
              <select
                className={inputStyles}
                value={draft.billing_mode}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    billing_mode: event.target.value as PlatformSubscriptionConfiguration["billing_mode"],
                  }));
                  setTestResult(null);
                  setProviderTestResult(null);
                  setProviderTestFingerprint("");
                  setSaved(false);
                }}
              >
                <option value="TEST">Test</option>
                <option value="LIVE">Live</option>
              </select>
            </label>
          </div>
          {draft.billing_provider !== "MANUAL" ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelStyles}>Provider secret key {draft.billing_secret_configured ? "(leave blank to keep saved key)" : ""}</span>
                  <input className={inputStyles} type="password" autoComplete="new-password" value={billingSecret} onChange={(event) => { setBillingSecret(event.target.value); setProviderTestResult(null); setProviderTestFingerprint(""); setSaved(false); }} placeholder={draft.billing_secret_configured ? "Saved key is not displayed" : `Enter ${draft.billing_mode.toLowerCase()} secret key`} />
                  <span className="mt-1 block text-xs text-muted">Encrypted at rest. Never shown again after saving.</span>
                </label>
              <label className="block">
                <span className={labelStyles}>Webhook signing secret {draft.billing_webhook_secret_configured ? "(leave blank to keep saved secret)" : ""}</span>
                <input className={inputStyles} type="password" autoComplete="new-password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={draft.billing_webhook_secret_configured ? "Saved secret is not displayed" : "Enter signing secret from provider dashboard"} />
                <span className="mt-1 block text-xs leading-5 text-muted">The value is encrypted at rest and never returned to the browser.</span>
              </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={providerTestMutation.isPending || (!billingSecret.trim() && !draft.billing_secret_configured)} onClick={() => providerTestMutation.mutate({ billing_provider: draft.billing_provider as "STRIPE" | "PAYSTACK" | "FLUTTERWAVE", billing_mode: draft.billing_mode, ...(billingSecret.trim() ? { billing_secret: billingSecret.trim() } : {}) })}>
                  <Play className="h-4 w-4" /> {providerTestMutation.isPending ? "Checking credentials…" : "Test and securely save provider key"}
                </Button>
                <span className="text-xs text-muted">A read-only balance check is sent. No customer payment is made.</span>
              </div>
              {providerTestMutation.isError ? <p className="text-sm text-red-700">{getApiErrorMessage(providerTestMutation.error)}</p> : null}
              {providerTestResult?.connected ? <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="h-4 w-4" />{providerTestResult.message}</p> : null}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(["PAYSTACK", "FLUTTERWAVE", "STRIPE"] as const).map((provider) => (["TEST", "LIVE"] as const).map((mode) => {
                  const item = draft.provider_credentials?.[provider]?.[mode];
                  return <div key={`${provider}-${mode}`} className="rounded-lg border border-border p-3 text-xs"><p className="font-semibold text-ink">{provider} · {mode}</p><p className="mt-1 text-muted">Key {item?.secret_configured ? "saved" : "missing"} · Webhook {item?.webhook_secret_configured ? "saved" : "missing"}</p></div>;
                }))}
              </div>
              <div className="rounded-lg border border-border bg-stone-50 p-3 text-sm">
                <p className="font-medium text-ink">Webhook endpoint</p>
                <code className="mt-1 block break-all text-xs text-muted">{`${window.location.origin}/api/v1/webhooks/billing/${draft.billing_provider.toLowerCase()}`}</code>
              </div>
            </div>
          ) : null}
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
            Paid monthly checkout enrolls the customer in gateway-managed automatic
            renewal. Paystack accepts recurring card or Nigerian direct debit payments;
            Flutterwave recurring plans are card-only. Verify the selected live
            credentials and webhook delivery before enabling paid access.
          </div>
        </Card>
      ) : null}

      {activeTab === "test" ? (
        <Card
          id="subscription-panel-test"
          role="tabpanel"
          className="p-5 sm:p-7"
        >
          <SectionHeader
            title="Test payment flow"
            description="Check credentials without a charge, preview checkout states, and run an actual provider checkout from a business account."
          />
          {draft.billing_provider === "MANUAL" ? (
            <p className="mt-4 rounded-lg border border-border p-4 text-sm text-muted">Choose Paystack, Flutterwave, or Stripe in the Billing provider tab to test gateway credentials.</p>
          ) : (
            <div className="mt-5 rounded-xl border border-border p-5">
              <h3 className="font-semibold text-ink">Provider credential check</h3>
              <p className="mt-1 text-sm text-muted">Set and test provider credentials in the Billing provider tab. This screen previews checkout outcomes and links to a real test-mode checkout; preview buttons never charge a customer.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button disabled={providerTestMutation.isPending || (!billingSecret.trim() && !draft.billing_secret_configured)} onClick={() => {
                  if (draft.billing_provider === "MANUAL") return;
                  providerTestMutation.mutate({ billing_provider: draft.billing_provider, billing_mode: draft.billing_mode, ...(billingSecret.trim() ? { billing_secret: billingSecret.trim() } : {}) });
                }}>
                  <Play className="h-4 w-4" /> {providerTestMutation.isPending ? "Checking provider…" : "Test provider credentials"}
                </Button>
                {draft.billing_secret_configured ? <span className="text-xs text-muted">A provider key is stored securely.</span> : null}
              </div>
              {providerTestMutation.isError ? <p className="mt-3 text-sm text-red-700">{getApiErrorMessage(providerTestMutation.error)}</p> : null}
              {providerTestResult?.connected ? <p className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 className="h-4 w-4" />{providerTestResult.message}</p> : null}
            </div>
          )}
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4 rounded-xl border border-border bg-stone-50 p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-primary-soft p-2 text-primary">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Selected provider
                  </p>
                  <p className="font-semibold text-ink">
                    {draft.billing_provider === "MANUAL"
                      ? "Manual / offline billing"
                      : draft.billing_provider}{" "}
                    · {draft.billing_mode}
                  </p>
                </div>
              </div>
              <label>
                <span className={labelStyles}>Payment method to preview</span>
                <select
                  className={inputStyles}
                  value={testMethod}
                  onChange={(event) => {
                    setTestMethod(event.target.value);
                    setTestResult(null);
                  }}
                >
                  {PAYMENT_METHODS[draft.billing_provider].map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelStyles}>Test amount</span>
                <input className={inputStyles} type="number" min="1" step="0.01" value={testAmount} onChange={(event) => { setTestAmount(event.target.value); setTestResult(null); }} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={draft.billing_provider === "MANUAL" || Number(testAmount) <= 0} onClick={() => setTestResult("success")}>
                  <Play className="h-4 w-4" /> Preview success state
                </Button>
                <Button variant="outline" disabled={draft.billing_provider === "MANUAL" || Number(testAmount) <= 0} onClick={() => setTestResult("declined")}>Preview declined state</Button>
              </div>
            </div>
            <div className="rounded-xl border border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-ink">Checkout preview</h3>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  UI PREVIEW ONLY
                </span>
              </div>
              <div className="mt-4 rounded-lg border border-border bg-white p-4">
                <p className="text-xs text-muted">FashionOS subscription</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {draft.plans.find((plan) => plan.is_active)?.name ?? "Sample plan"}
                </p>
                <p className="mt-1 text-sm text-muted">
                    {draft.billing_provider} · {testMethod.replace(/_/g, " ")}
                </p>
                <div className="mt-4 border-t border-border pt-3 text-sm">
                  <span className="text-muted">Test charge</span>
                  <strong className="float-right text-ink">
                    {draft.plans.find((plan) => plan.is_active)?.currency ?? "NGN"} {Number(testAmount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
              {testResult ? (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${testResult === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
                >
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  {testResult === "success"
                    ? "Sandbox preview passed. No charge was sent to a payment provider."
                    : "Sandbox preview declined as expected. No charge was sent to a payment provider."}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  Run either scenario to preview the payment confirmation or
                  failure state.
                </p>
              )}
            </div>
          </div>
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            Preview buttons only display possible checkout outcomes. They do not
            simulate a card or transfer, contact a gateway, or record a payment.
          </p>
          {draft.billing_provider !== "MANUAL" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-stone-50 p-4">
              <p className="max-w-2xl text-sm leading-6 text-muted">To verify the full {draft.billing_mode.toLowerCase()} flow, sign into a business workspace, select a paid plan, and complete the provider checkout. FashionOS activates access only after provider verification.</p>
              <Link className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-stone-50" to="/subscription">Open plan checkout</Link>
            </div>
          ) : null}
        </Card>
      ) : null}

      {activeTab === "businesses" ? (
        <Card
          id="subscription-panel-businesses"
          role="tabpanel"
          className="p-5 sm:p-7"
        >
          <SectionHeader
            title="Business plan selections"
            description="Current selections across the first 100 registered businesses."
          />
          <div className="mt-4 divide-y divide-border">
            {tenants.map((business) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                key={business.id}
              >
                <div>
                  <p className="text-sm font-medium text-ink">{business.name}</p>
                  <p className="text-xs text-muted">
                    {business.owner_email || business.email || "No contact email"}
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                  {draft.plans.find(
                    (plan) => plan.id === business.subscription_plan_id,
                  )?.name ??
                    (business.subscription_plan_id
                      ? "Plan unavailable"
                      : "No plan selected")}
                </span>
              </div>
            ))}
            {tenants.length === 0 ? (
              <p className="py-4 text-sm text-muted">No business tenants found.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {saveMutation.isError ? (
        <InlineError message={getApiErrorMessage(saveMutation.error)} />
      ) : null}
      {confirmError ? <InlineError message={confirmError} /> : null}
      {saved ? <SuccessNotice>Subscription settings saved.</SuccessNotice> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="max-w-2xl text-xs leading-5 text-muted">
          Save changes from any tab. Credential testing is read-only. Complete a
          test-mode checkout and webhook round trip before switching to live keys.
        </p>
        <Button
          disabled={saveMutation.isPending || configQuery.isLoading}
          onClick={save}
        >
          <ShieldCheck className="h-4 w-4" />
          {saveMutation.isPending
            ? "Saving…"
            : activeTab === "test"
              ? "Confirm provider setup"
              : "Save subscription settings"}
        </Button>
      </div>
    </div>
  );
}
