import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, Upload, Building2, SlidersHorizontal, Workflow, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { getApiErrorMessage } from "../api/client";
import { listBusinessAudit } from "../api/business";
import { BusinessLogo } from "../components/BusinessLogo";
import {
  Card,
  InlineError,
  PageContainer,
  PageHeader,
  SectionHeader,
  Skeleton,
  SuccessNotice,
  buttonStyles,
  errorTextStyles,
  helpTextStyles,
  inputStyles,
  labelStyles,
  textareaStyles,
} from "../components/ui";
import {
  useBusinessSettings,
  useUpdateBusinessSettings,
} from "../hooks/useBusiness";
import {
  businessSettingsSchema,
  supportedCurrencies,
  supportedTimezones,
  type BusinessSettingsFormValues,
} from "../lib/validation";
import { ORDER_STATUSES, ORDER_TRANSITIONS } from "../lib/orders";

const currencyNames: Record<string, string> = {
  NGN: "Nigerian naira",
  USD: "US dollar",
  GBP: "British pound",
  EUR: "Euro",
  GHS: "Ghanaian cedi",
  KES: "Kenyan shilling",
  ZAR: "South African rand",
};

export function SettingsPage() {
  const settings = useBusinessSettings();
  const updateSettings = useUpdateBusinessSettings();
  const [apiError, setApiError] = useState("");
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<"business" | "preferences" | "workflow" | "audit">("business");
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [statusTransitions, setStatusTransitions] = useState<Record<string, string[]>>({});
  const [auditOptions, setAuditOptions] = useState({ enabled: true, capture_ip: false, capture_device: false, capture_details: false });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<BusinessSettingsFormValues>({
    resolver: zodResolver(businessSettingsSchema),
  });

  useEffect(() => {
    if (!settings.data) return;
    reset({
      name: settings.data.name,
      phone: settings.data.phone,
      email: settings.data.email ?? "",
      address: settings.data.address ?? "",
      logo_url: settings.data.logo_url ?? "",
      currency: settings.data
        .currency as BusinessSettingsFormValues["currency"],
      timezone: settings.data
        .timezone as BusinessSettingsFormValues["timezone"],
      invoice_notes: settings.data.invoice_notes ?? "",
      invoice_footer: settings.data.invoice_footer ?? "",
      delivery_charges_enabled: settings.data.delivery_charges_enabled ?? false,
      order_status_configuration: settings.data.order_status_configuration ?? { labels: {}, transitions: {} },
      audit_configuration: settings.data.audit_configuration ?? { enabled: true, capture_ip: false, capture_device: false, capture_details: false },
    });
  }, [reset, settings.data]);

  useEffect(() => {
    const status = settings.data?.order_status_configuration;
    setStatusLabels(status?.labels ?? {});
    setStatusTransitions(status?.transitions ?? {});
    setAuditOptions({ enabled: settings.data?.audit_configuration?.enabled ?? true, capture_ip: settings.data?.audit_configuration?.capture_ip ?? false, capture_device: settings.data?.audit_configuration?.capture_device ?? false, capture_details: settings.data?.audit_configuration?.capture_details ?? false });
  }, [settings.data]);

  async function submit(values: BusinessSettingsFormValues) {
    setApiError("");
    setSaved(false);
    try {
      const business = await updateSettings.mutateAsync({
        ...values,
        order_status_configuration: { labels: statusLabels, transitions: statusTransitions },
        audit_configuration: auditOptions,
        email: emptyToNull(values.email),
        address: emptyToNull(values.address),
        logo_url: emptyToNull(values.logo_url),
        invoice_notes: emptyToNull(values.invoice_notes),
        invoice_footer: emptyToNull(values.invoice_footer),
      });
      reset({
        ...values,
        email: business.email ?? "",
        address: business.address ?? "",
        logo_url: business.logo_url ?? "",
        invoice_notes: business.invoice_notes ?? "",
        invoice_footer: business.invoice_footer ?? "",
        delivery_charges_enabled: business.delivery_charges_enabled,
        order_status_configuration: business.order_status_configuration ?? { labels: {}, transitions: {} },
        audit_configuration: business.audit_configuration ?? { enabled: true, capture_ip: false, capture_device: false, capture_details: false },
      });
      setSaved(true);
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  if (settings.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-96" />
      </PageContainer>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <PageContainer>
        <InlineError
          message="Could not load business settings."
          retry={() => void settings.refetch()}
        />
      </PageContainer>
    );
  }

  const logoUrl = watch("logo_url");
  const businessName = watch("name") || settings.data.name;
  const configurationDirty = JSON.stringify(statusLabels) !== JSON.stringify(settings.data.order_status_configuration?.labels ?? {}) || JSON.stringify(statusTransitions) !== JSON.stringify(settings.data.order_status_configuration?.transitions ?? {}) || JSON.stringify(auditOptions) !== JSON.stringify(settings.data.audit_configuration ?? { enabled: true, capture_ip: false, capture_device: false, capture_details: false });

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="Workspace"
        title="Business Settings"
        description="Manage your business identity and invoice preferences."
      />
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Business settings sections">
        {([ ["business", "Business profile", Building2], ["preferences", "Preferences", SlidersHorizontal], ["workflow", "Order workflow", Workflow], ["audit", "Audit", ScrollText] ] as const).map(([key, label, Icon]) => <button key={key} type="button" role="tab" aria-selected={activeSection === key} onClick={() => setActiveSection(key)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${activeSection === key ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>
      <form
        className="mt-7 space-y-6"
        onSubmit={handleSubmit(submit)}
        noValidate
      >
        {activeSection === "business" ? <>
        <SettingsCard
          title="Business profile"
          description="Contact details customers see on documents from your business."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Business name" error={errors.name?.message}>
              <input className={inputStyles} {...register("name")} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <input
                className={inputStyles}
                type="tel"
                {...register("phone")}
              />
            </Field>
            <Field label="Email optional" error={errors.email?.message}>
              <input
                className={inputStyles}
                type="email"
                {...register("email")}
              />
            </Field>
            <Field label="Address optional" error={errors.address?.message}>
              <textarea className={textareaStyles} {...register("address")} />
            </Field>
          </div>
        </SettingsCard>
        <SettingsCard
          title="Branding"
          description="Upload an image file (PNG, JPG, WebP, SVG) or enter a secure logo image URL."
        >
          <div className="grid items-start gap-6 md:grid-cols-[1fr_220px]">
            <div className="space-y-4">
              <div>
                <label className={labelStyles} htmlFor="logo-file-input">
                  Upload Logo File
                </label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    id="logo-file-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const dataUrl = evt.target?.result as string;
                        if (dataUrl) {
                          setValue("logo_url", dataUrl, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <label
                    htmlFor="logo-file-input"
                    className={buttonStyles({
                      variant: "outline",
                      className: "cursor-pointer inline-flex items-center gap-2",
                    })}
                  >
                    <Upload className="h-4 w-4" />
                    Choose Image File
                  </label>
                  {logoUrl ? (
                    <button
                      className={buttonStyles({
                        variant: "outline",
                        className: "h-11 px-3 text-xs text-red-700 hover:bg-red-50 border-red-200",
                      })}
                      type="button"
                      aria-label="Remove logo"
                      onClick={() =>
                        setValue("logo_url", "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <label className={labelStyles} htmlFor="business-logo-url">
                  Logo URL optional
                </label>
                <input
                  id="business-logo-url"
                  className={inputStyles}
                  placeholder="https://example.com/logo.png"
                  {...register("logo_url")}
                />
                <span className={helpTextStyles}>
                  Supports uploaded image files or direct image URLs.
                </span>
                {errors.logo_url ? (
                  <span className={errorTextStyles}>
                    {errors.logo_url.message}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-border bg-stone-50 p-5 text-center">
              <BusinessLogo
                name={businessName}
                logoUrl={logoUrl}
                className="mx-auto h-24 w-24 border border-border"
              />
              <p className="mt-3 text-xs font-medium text-muted">
                Logo preview
              </p>
            </div>
          </div>
        </SettingsCard>
        </> : null}

        {activeSection === "preferences" ? <>
        <SettingsCard
          title="Regional preferences"
          description="These settings control money and date-time presentation across FashionOS."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Currency" error={errors.currency?.message}>
              <select className={inputStyles} {...register("currency")}>
                {supportedCurrencies.map((code) => (
                  <option key={code} value={code}>
                    {code} — {currencyNames[code]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Timezone" error={errors.timezone?.message}>
              <select className={inputStyles} {...register("timezone")}>
                {supportedTimezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Invoice preferences"
          description="Add reusable payment guidance and a closing message to every invoice."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Default invoice notes optional"
              error={errors.invoice_notes?.message}
              help="Shown below invoice-specific notes."
            >
              <textarea
                className={textareaStyles}
                {...register("invoice_notes")}
              />
            </Field>
            <Field
              label="Invoice footer optional"
              error={errors.invoice_footer?.message}
              help="Shown at the bottom of printed and on-screen invoices."
            >
              <textarea
                className={textareaStyles}
                {...register("invoice_footer")}
              />
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Delivery options"
          description="Turn delivery charges on or off for your business."
        >
          <div className="space-y-4">
            <label className="flex items-start gap-3 text-sm text-ink">
              <input className="mt-1 h-4 w-4 accent-primary" type="checkbox" {...register("delivery_charges_enabled")} />
              <span>
                Enable delivery charges
                <span className="mt-1 block text-muted">Adds an optional Decimal-safe delivery charge to an order total, its invoice, balances, and dashboard figures.</span>
              </span>
            </label>
          </div>
        </SettingsCard>
        </> : null}

        {activeSection === "workflow" ? <>
        <SettingsCard title="Order status workflow" description="Set the labels and next steps your team uses from order intake through delivery. The production stages stay visible together so the workflow is easy to review.">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ORDER_STATUSES.map((key, index) => {
              const defaults = ORDER_TRANSITIONS[key];
              const selected = statusTransitions[key] ?? defaults;
              const terminal = defaults.length === 0;
              return <section key={key} className={`rounded-xl border p-4 ${terminal ? "border-stone-200 bg-stone-50/70" : "border-border bg-white"}`}>
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{terminal ? "Completed / closed" : "Production stage"}</p><p className="font-semibold text-ink">{key.replace(/_/g, " ")}</p></div></div>
                <label className="mt-4 block text-xs font-semibold text-muted">DISPLAY NAME<input aria-label={`${key} display name`} className={inputStyles} maxLength={40} value={statusLabels[key] ?? key.replace(/_/g, " ")} onChange={(event) => setStatusLabels((current) => ({ ...current, [key]: event.target.value }))} /></label>
                <div className="mt-4"><p className="text-xs font-semibold text-muted">TEAM CAN MOVE THIS ORDER TO</p>{terminal ? <p className="mt-2 text-sm text-muted">This is a terminal status; no further status changes are allowed.</p> : <div className="mt-2 space-y-2">{ORDER_STATUSES.filter((target) => target !== key && (target !== "DELIVERED" || key === "READY")).map((target) => <label key={target} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-stone-50"><input type="checkbox" className="h-4 w-4 accent-primary" checked={target === "CANCELLED" || selected.includes(target)} disabled={target === "CANCELLED"} onChange={(event) => setStatusTransitions((current) => ({ ...current, [key]: event.target.checked ? [...selected, target] : selected.filter((value) => value !== target) }))} /><span>{statusLabels[target] || target.replace(/_/g, " ")}</span>{target === "CANCELLED" ? <span className="ml-auto text-xs text-muted">Always available</span> : null}</label>)}</div>}</div>
              </section>;
            })}
          </div>
          <p className="mt-4 rounded-lg bg-primary-soft/50 p-3 text-sm text-muted">Delivered and cancelled orders remain final. Completing delivery still uses the delivery handoff step, including delivery proof where required.</p>
        </SettingsCard>
        </> : null}

        {activeSection === "audit" ? <>
        <SettingsCard title="Business audit log" description="Control which operational changes are recorded and which request details are captured.">
          <div className="grid gap-3 sm:grid-cols-2">{([ ["enabled", "Record business actions"], ["capture_ip", "Capture source IP"], ["capture_device", "Capture device/browser details"], ["capture_details", "Capture changed field details"] ] as const).map(([key, label]) => <label className="flex items-center gap-3 text-sm" key={key}><input type="checkbox" checked={auditOptions[key]} onChange={(event) => setAuditOptions((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div>
        </SettingsCard>

        {settings.data.enabled_features?.includes("audit") ? <BusinessAuditSection /> : null}
        </> : null}

        {apiError ? <InlineError message={apiError} /> : null}
        {saved ? <SuccessNotice>Business settings saved.</SuccessNotice> : null}
        <div className="flex justify-end">
          <button
            className={buttonStyles({ size: "lg", className: "min-w-44" })}
            type="submit"
            disabled={updateSettings.isPending || (!isDirty && !configurationDirty)}
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Save settings
          </button>
        </div>
      </form>
    </PageContainer>
  );
}

function BusinessAuditSection() {
  const [entries, setEntries] = useState<import("../api/admin").AdminAuditItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void listBusinessAudit().then(setEntries).catch(() => setError("Could not load business audit history."));
  }, []);
  return <SettingsCard title="Audit history" description="Recent actions in this business workspace.">{error ? <InlineError message={error} /> : null}<div className="space-y-2">{entries.map((entry) => <div className="rounded-lg border border-border p-3" key={entry.id}><p className="text-sm font-semibold">{entry.summary}</p><p className="text-xs text-muted">{entry.actor_name} · {entry.action} · {new Date(entry.timestamp).toLocaleString()}{entry.source_ip ? ` · ${entry.source_ip}` : ""}</p></div>)}{entries.length === 0 && !error ? <p className="text-sm text-muted">No recent business actions.</p> : null}</div></SettingsCard>;
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-7">
      <SectionHeader title={title} description={description} />
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Field({
  label,
  error,
  help,
  children,
}: {
  label: string;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelStyles}>{label}</span>
      {children}
      {help ? <span className={helpTextStyles}>{help}</span> : null}
      {error ? <span className={errorTextStyles}>{error}</span> : null}
    </label>
  );
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}
