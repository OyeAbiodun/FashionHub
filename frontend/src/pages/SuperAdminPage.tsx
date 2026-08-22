import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CheckCircle2,
  DollarSign,
  Edit,
  Loader2,
  Mail,
  Power,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  fetchAdminBusinesses,
  fetchPlatformActivity,
  fetchPlatformEmailConfiguration,
  fetchPlatformMetrics,
  sendPlatformEmailTest,
  toggleBusinessActive,
  updateBusinessEntitlements,
  updatePlatformEmailConfiguration,
  type BusinessTenantDetail,
  type PlatformEmailProvider,
  type SmtpSecurityMode,
} from "../api/admin";
import { getApiErrorMessage } from "../api/client";
import {
  Button,
  Card,
  Dialog,
  InlineError,
  MetricCard,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SuccessNotice,
  buttonStyles,
  inputStyles,
  labelStyles,
} from "../components/ui";

const ALL_MODULES = [
  { key: "customers", label: "Customers Module" },
  { key: "measurements", label: "Measurements Module" },
  { key: "templates", label: "Measurement Templates" },
  { key: "orders", label: "Orders Module" },
  { key: "invoices", label: "Invoices & Payments" },
  { key: "reports", label: "Financial Reports & Dashboard" },
  { key: "team", label: "Team & Staff Management" },
  { key: "tasks", label: "Tasks & Work Assignments" },
];

const EMAIL_PRESETS: Record<
  Exclude<PlatformEmailProvider, "CUSTOM_SMTP">,
  { host: string; port: number; security: SmtpSecurityMode }
> = {
  GMAIL: { host: "smtp.gmail.com", port: 587, security: "STARTTLS" },
  OUTLOOK: { host: "smtp.office365.com", port: 587, security: "STARTTLS" },
  YAHOO: { host: "smtp.mail.yahoo.com", port: 465, security: "TLS" },
};

const defaultEmailForm = {
  provider: "GMAIL" as PlatformEmailProvider,
  enabled: false,
  smtp_host: "smtp.gmail.com",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  security_mode: "STARTTLS" as SmtpSecurityMode,
  from_email: "",
  from_name: "FashionOS",
};

export function SuperAdminPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editingBusiness, setEditingBusiness] = useState<BusinessTenantDetail | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [maxStaff, setMaxStaff] = useState(10);

  const [dialogError, setDialogError] = useState("");
  const [dialogSuccess, setDialogSuccess] = useState(false);
  const [emailForm, setEmailForm] = useState(defaultEmailForm);
  const [testRecipient, setTestRecipient] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");

  const metricsQuery = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: fetchPlatformMetrics,
  });

  const businessesQuery = useQuery({
    queryKey: ["admin", "businesses", search],
    queryFn: () => fetchAdminBusinesses({ search }),
  });

  const activityQuery = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: fetchPlatformActivity,
  });

  const emailConfigurationQuery = useQuery({
    queryKey: ["platform", "email"],
    queryFn: fetchPlatformEmailConfiguration,
  });

  useEffect(() => {
    const configuration = emailConfigurationQuery.data;
    if (!configuration) return;
    setEmailForm({
      provider: configuration.provider,
      enabled: configuration.enabled,
      smtp_host: configuration.smtp_host,
      smtp_port: configuration.smtp_port,
      smtp_username: configuration.smtp_username ?? "",
      smtp_password: "",
      security_mode: configuration.security_mode,
      from_email: configuration.from_email ?? "",
      from_name: configuration.from_name,
    });
  }, [emailConfigurationQuery.data]);

  const updateEntitlementsMutation = useMutation({
    mutationFn: (data: { id: string; features: string[]; maxStaff: number }) =>
      updateBusinessEntitlements(data.id, {
        enabled_features: data.features,
        max_staff_users: data.maxStaff,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      setDialogSuccess(true);
      setTimeout(() => {
        setEditingBusiness(null);
        setDialogSuccess(false);
      }, 1000);
    },
    onError: (err) => {
      setDialogError(getApiErrorMessage(err));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => toggleBusinessActive(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const saveEmailMutation = useMutation({
    mutationFn: () =>
      updatePlatformEmailConfiguration({
        ...emailForm,
        smtp_username: emailForm.smtp_username || null,
        smtp_password: emailForm.smtp_password || null,
      }),
    onSuccess: () => {
      setEmailError("");
      setEmailSuccess("Platform email configuration saved.");
      setEmailForm((current) => ({ ...current, smtp_password: "" }));
      void queryClient.invalidateQueries({ queryKey: ["platform", "email"] });
    },
    onError: (error) => setEmailError(getApiErrorMessage(error)),
  });

  const testEmailMutation = useMutation({
    mutationFn: () => sendPlatformEmailTest(testRecipient),
    onSuccess: (response) => {
      setEmailError("");
      setEmailSuccess(response.message);
      void queryClient.invalidateQueries({ queryKey: ["platform", "email"] });
    },
    onError: (error) => setEmailError(getApiErrorMessage(error)),
  });

  function openEditEntitlements(b: BusinessTenantDetail) {
    setEditingBusiness(b);
    setSelectedFeatures(b.enabled_features ?? []);
    setMaxStaff(b.max_staff_users ?? 10);
    setDialogError("");
    setDialogSuccess(false);
  }

  function handleSaveEntitlements() {
    if (!editingBusiness) return;
    setDialogError("");
    updateEntitlementsMutation.mutate({
      id: editingBusiness.id,
      features: selectedFeatures,
      maxStaff,
    });
  }

  function selectEmailProvider(provider: PlatformEmailProvider) {
    setEmailForm((current) => {
      const preset = provider === "CUSTOM_SMTP" ? null : EMAIL_PRESETS[provider];
      return {
        ...current,
        provider,
        ...(preset
          ? { smtp_host: preset.host, smtp_port: preset.port, security_mode: preset.security }
          : {}),
      };
    });
  }

  function saveEmailConfiguration() {
    setEmailError("");
    setEmailSuccess("");
    saveEmailMutation.mutate();
  }

  function sendEmailTest() {
    setEmailError("");
    setEmailSuccess("");
    testEmailMutation.mutate();
  }

  const metrics = metricsQuery.data;
  const businesses = businessesQuery.data?.items ?? [];
  const activity = activityQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform Backoffice"
        title="Super Admin Control Center"
        description="Oversee fashion business tenants, set module entitlements, configure staff limits, and manage platform health."
      />

      {/* KPI Cards */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Businesses"
          value={metrics ? metrics.total_businesses.toString() : "..."}
          subtext={`${metrics?.active_businesses ?? 0} active tenants`}
          icon={Building2}
        />
        <MetricCard
          label="Total Users"
          value={metrics ? metrics.total_users.toString() : "..."}
          subtext="Registered platform accounts"
          icon={Users}
        />
        <MetricCard
          label="Total Orders"
          value={metrics ? metrics.total_orders.toString() : "..."}
          subtext="Orders processed platform-wide"
          icon={CheckCircle2}
        />
        <MetricCard
          label="Platform Revenue (GMV)"
          value={metrics ? `₦${metrics.total_revenue}` : "..."}
          subtext="Total payments across all tenants"
          icon={DollarSign}
        />
      </div>

      <Card className="mt-8 p-5 sm:p-7">
        <SectionHeader
          title="Platform Settings — Email Configuration"
          description="Configure the single FashionOS transactional email service used by every tenant. Gmail, Outlook, and Yahoo commonly require an app password or SMTP-specific credentials."
        />
        <div className="mt-5 flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
          {emailConfigurationQuery.data?.configured ? (
            <span className="font-medium text-emerald-700">✓ Email configured</span>
          ) : (
            <span className="font-medium text-amber-700">⚠ Email not configured</span>
          )}
          {emailConfigurationQuery.data?.last_test_status ? (
            <span className="text-muted">
              Last test: {emailConfigurationQuery.data.last_test_status.toLowerCase()}
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <label>
            <span className={labelStyles}>Provider</span>
            <select
              className={inputStyles}
              value={emailForm.provider}
              onChange={(event) => selectEmailProvider(event.target.value as PlatformEmailProvider)}
            >
              <option value="GMAIL">Gmail</option>
              <option value="OUTLOOK">Outlook / Microsoft</option>
              <option value="YAHOO">Yahoo</option>
              <option value="CUSTOM_SMTP">Custom SMTP</option>
            </select>
          </label>
          <label className="flex items-center gap-3 pt-7 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={emailForm.enabled}
              onChange={(event) => setEmailForm((current) => ({ ...current, enabled: event.target.checked }))}
            />
            Enable platform email delivery
          </label>
          <label>
            <span className={labelStyles}>SMTP Host</span>
            <input
              className={inputStyles}
              value={emailForm.smtp_host}
              onChange={(event) => setEmailForm((current) => ({ ...current, smtp_host: event.target.value }))}
            />
          </label>
          <label>
            <span className={labelStyles}>SMTP Port</span>
            <input
              className={inputStyles}
              type="number"
              min="1"
              max="65535"
              value={emailForm.smtp_port}
              onChange={(event) => setEmailForm((current) => ({ ...current, smtp_port: Number(event.target.value) }))}
            />
          </label>
          <label>
            <span className={labelStyles}>Username / Email</span>
            <input
              className={inputStyles}
              type="email"
              value={emailForm.smtp_username}
              onChange={(event) => setEmailForm((current) => ({ ...current, smtp_username: event.target.value }))}
            />
          </label>
          <label>
            <span className={labelStyles}>Password / App Password</span>
            <input
              className={inputStyles}
              type="password"
              autoComplete="new-password"
              placeholder={emailConfigurationQuery.data?.smtp_password_configured ? "Configured — leave blank to keep" : "Enter app password"}
              value={emailForm.smtp_password}
              onChange={(event) => setEmailForm((current) => ({ ...current, smtp_password: event.target.value }))}
            />
          </label>
          <label>
            <span className={labelStyles}>Security</span>
            <select
              className={inputStyles}
              value={emailForm.security_mode}
              onChange={(event) => setEmailForm((current) => ({ ...current, security_mode: event.target.value as SmtpSecurityMode }))}
            >
              <option value="STARTTLS">STARTTLS</option>
              <option value="TLS">TLS</option>
              <option value="NONE">None</option>
            </select>
          </label>
          <label>
            <span className={labelStyles}>From Email</span>
            <input
              className={inputStyles}
              type="email"
              value={emailForm.from_email}
              onChange={(event) => setEmailForm((current) => ({ ...current, from_email: event.target.value }))}
            />
          </label>
          <label>
            <span className={labelStyles}>From Name</span>
            <input
              className={inputStyles}
              value={emailForm.from_name}
              onChange={(event) => setEmailForm((current) => ({ ...current, from_name: event.target.value }))}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          SMTP credentials are encrypted server-side and are never displayed after saving.
        </p>
        {emailError ? <InlineError message={emailError} /> : null}
        {emailSuccess ? <SuccessNotice>{emailSuccess}</SuccessNotice> : null}
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className={labelStyles}>Test Recipient Email</span>
            <input
              className={inputStyles}
              type="email"
              placeholder="admin@example.com"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!testRecipient || testEmailMutation.isPending}
            onClick={sendEmailTest}
          >
            <Send className="h-4 w-4" /> Send Test Email
          </Button>
          <Button type="button" disabled={saveEmailMutation.isPending} onClick={saveEmailConfiguration}>
            {saveEmailMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Save Configuration
          </Button>
        </div>
      </Card>

      {/* Main Tenant Directory */}
      <div className="mt-8 space-y-6">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader
              title="Fashion Business Tenants"
              description="Manage business accounts, toggle active status, and configure feature entitlements."
            />

            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className={`${inputStyles} pl-9 h-10`}
                placeholder="Search business name, phone, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Owner Contact</th>
                  <th className="px-4 py-3">Staff Limit</th>
                  <th className="px-4 py-3">Enabled Features</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {businesses.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-ink">{b.name}</div>
                      <div className="text-xs text-muted">
                        {b.currency} • {b.timezone}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-ink">{b.phone}</div>
                      <div className="text-xs text-muted">{b.email || "No email"}</div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-ink">
                      {b.user_count} / {b.max_staff_users} users
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(b.enabled_features || []).map((feat) => (
                          <span
                            key={feat}
                            className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60"
                          >
                            {feat}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge
                        status={b.is_active ? "ACTIVE" : "CANCELLED"}
                        label={b.is_active ? "Active" : "Suspended"}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className={buttonStyles({
                            variant: "outline",
                            size: "sm",
                            className: "h-8 px-2.5 text-xs inline-flex items-center gap-1",
                          })}
                          type="button"
                          onClick={() => openEditEntitlements(b)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Entitlements
                        </button>
                        <button
                          className={buttonStyles({
                            variant: "outline",
                            size: "sm",
                            className: b.is_active
                              ? "h-8 px-2.5 text-xs text-red-700 hover:bg-red-50 border-red-200"
                              : "h-8 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-200",
                          })}
                          type="button"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate(b.id)}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {b.is_active ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {businesses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      No businesses found matching query.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Activity Log */}
        <Card className="p-5 sm:p-7">
          <SectionHeader
            title="System Activity Feed"
            description="Live stream of recent tenant registrations and system milestones."
          />
          <div className="mt-4 space-y-3">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3.5 bg-slate-50/50"
              >
                <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="text-xs text-muted">{item.description}</p>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(item.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Edit Feature Entitlements Modal */}
      {editingBusiness ? (
        <Dialog
          title={`Feature Entitlements: ${editingBusiness.name}`}
          onClose={() => setEditingBusiness(null)}
        >
          <div className="space-y-5">
            <div>
              <label className={labelStyles} htmlFor="max-staff-limit">
                Max Staff User Accounts Limit
              </label>
              <input
                id="max-staff-limit"
                type="number"
                min={1}
                max={1000}
                className={inputStyles}
                value={maxStaff}
                onChange={(e) => setMaxStaff(Number(e.target.value))}
              />
              <span className="text-xs text-muted mt-1 block">
                Maximum number of staff accounts this business is allowed to create.
              </span>
            </div>

            <div>
              <label className={labelStyles}>Enabled Feature Modules</label>
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
                {ALL_MODULES.map((mod) => {
                  const isChecked = selectedFeatures.includes(mod.key);
                  return (
                    <label
                      key={mod.key}
                      className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFeatures((prev) => [...prev, mod.key]);
                          } else {
                            setSelectedFeatures((prev) => prev.filter((k) => k !== mod.key));
                          }
                        }}
                      />
                      <div className="text-sm font-medium text-ink">{mod.label}</div>
                    </label>
                  );
                })}
              </div>
            </div>

            {dialogError ? <InlineError message={dialogError} /> : null}
            {dialogSuccess ? <SuccessNotice>Entitlements updated successfully.</SuccessNotice> : null}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button
                variant="outline"
                type="button"
                onClick={() => setEditingBusiness(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={updateEntitlementsMutation.isPending}
                onClick={handleSaveEntitlements}
              >
                {updateEntitlementsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Save Entitlements
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}
