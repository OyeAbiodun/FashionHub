import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { getApiErrorMessage } from "../api/client";
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
    });
  }, [reset, settings.data]);

  async function submit(values: BusinessSettingsFormValues) {
    setApiError("");
    setSaved(false);
    try {
      const business = await updateSettings.mutateAsync({
        ...values,
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

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow="Workspace"
        title="Business Settings"
        description="Manage your business identity and invoice preferences."
      />
      <form
        className="mt-7 space-y-6"
        onSubmit={handleSubmit(submit)}
        noValidate
      >
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
          description="Use a secure, publicly accessible image URL for your logo."
        >
          <div className="grid items-start gap-6 md:grid-cols-[1fr_220px]">
            <div>
              <label className={labelStyles} htmlFor="business-logo-url">
                Logo URL optional
              </label>
              <div className="flex gap-2">
                <input
                  id="business-logo-url"
                  className={inputStyles}
                  placeholder="https://example.com/logo.png"
                  {...register("logo_url")}
                />
                {logoUrl ? (
                  <button
                    className={buttonStyles({
                      variant: "outline",
                      className: "mt-2 h-11 w-11 px-0",
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
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <span className={helpTextStyles}>
                PNG, JPG, WebP, or SVG URLs work best on a transparent or white
                background.
              </span>
              {errors.logo_url ? (
                <span className={errorTextStyles}>
                  {errors.logo_url.message}
                </span>
              ) : null}
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

        {apiError ? <InlineError message={apiError} /> : null}
        {saved ? <SuccessNotice>Business settings saved.</SuccessNotice> : null}
        <div className="flex justify-end">
          <button
            className={buttonStyles({ size: "lg", className: "min-w-44" })}
            type="submit"
            disabled={updateSettings.isPending || !isDirty}
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
