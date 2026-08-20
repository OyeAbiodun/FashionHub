import { ArrowLeft, Loader2, Ruler } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { useCustomer } from "../hooks/useCustomers";
import {
  useCreateMeasurement,
  useMeasurementTemplate,
  useMeasurementTemplates,
} from "../hooks/useMeasurements";
import type {
  CreateMeasurementProfileInput,
  MeasurementUnit,
} from "../types/measurement";
import {
  Card,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
  buttonStyles,
  inputStyles,
  textareaStyles,
} from "../components/ui";

export function NewMeasurementPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const customerQuery = useCustomer(customerId);
  const templatesQuery = useMeasurementTemplates();
  const [templateId, setTemplateId] = useState("");
  const selectedTemplate = useMeasurementTemplate(templateId || undefined);
  const createMutation = useCreateMeasurement(customerId ?? "");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<MeasurementUnit>("INCH");
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState("");

  const customerName = useMemo(() => {
    const customer = customerQuery.data;
    return customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
      : "";
  }, [customerQuery.data]);

  useEffect(() => {
    if (!templateId && templatesQuery.data?.length) {
      setTemplateId(templatesQuery.data[0].id);
    }
  }, [templateId, templatesQuery.data]);

  useEffect(() => {
    if (selectedTemplate.data && !name) {
      setName(
        `${selectedTemplate.data.name} - ${new Date().toLocaleString("en-US", { month: "short", year: "numeric" })}`,
      );
    }
  }, [name, selectedTemplate.data]);

  const activeFields = useMemo(
    () =>
      selectedTemplate.data?.fields
        .filter((field) => field.is_active)
        .sort((first, second) => first.position - second.position) ?? [],
    [selectedTemplate.data],
  );

  useEffect(() => {
    if (!selectedTemplate.data) {
      return;
    }
    setValues(
      Object.fromEntries(
        activeFields.map((field) => [
          field.field_key,
          field.default_value ?? "",
        ]),
      ),
    );
    setFieldErrors({});
  }, [activeFields, selectedTemplate.data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const template = selectedTemplate.data;
    if (!template || !customerId) {
      return;
    }
    const nextErrors: Record<string, string> = {};
    for (const field of activeFields) {
      if (field.is_required && !values[field.field_key]) {
        nextErrors[field.field_key] = `${field.field_name} is required`;
      }
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setApiError("");
    const payload: CreateMeasurementProfileInput = {
      template_id: template.id,
      name,
      garment_type: template.garment_type,
      unit,
      notes: notes.trim() || null,
      values: activeFields
        .filter((field) => field.is_required || values[field.field_key])
        .map((field) => ({
          field_key: field.field_key,
          field_name: field.field_name,
          value: values[field.field_key],
          position: field.position,
        })),
    };
    try {
      const profile = await createMutation.mutateAsync(payload);
      navigate(`/measurement-profiles/${profile.id}`, { replace: true });
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  return (
    <PageContainer className="max-w-6xl">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to={`/customers/${customerId}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to customer
      </Link>
      <div className="mt-5">
        <PageHeader
          title="Add measurement"
          description={
            customerQuery.isLoading
              ? "Loading customer…"
              : `Create a template-driven sizing profile for ${customerName}.`
          }
        />
      </div>

      {templatesQuery.isLoading ? (
        <div className="mt-6">
          <Skeleton className="h-96" />
        </div>
      ) : null}
      {templatesQuery.isError ? (
        <div className="mt-6">
          <InlineError
            message="Could not load measurement templates."
            retry={() => void templatesQuery.refetch()}
          />
        </div>
      ) : null}
      {templatesQuery.data ? (
        <form
          className="mt-7 grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"
          onSubmit={submit}
        >
          <Card className="space-y-5 p-5 lg:sticky lg:top-24">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Ruler className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold text-ink">Profile setup</h2>
                <p className="text-xs text-muted">
                  Choose the template and unit.
                </p>
              </div>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-ink">Template</span>
              <select
                className={inputStyles}
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templatesQuery.data.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Profile name</span>
              <input
                className={inputStyles}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Unit</span>
              <select
                className={inputStyles}
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as MeasurementUnit)
                }
              >
                <option value="INCH">Inches</option>
                <option value="CM">Centimeters</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">
                Notes optional
              </span>
              <textarea
                className={textareaStyles}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink">
              Measurement values
            </h2>
            <p className="mt-1 text-sm text-muted">
              Enter each value using the selected unit. Required fields are
              marked.
            </p>
            {selectedTemplate.isLoading ? (
              <div className="mt-5">
                <Skeleton className="h-64" />
              </div>
            ) : null}
            {selectedTemplate.data ? (
              <div className="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                {activeFields.map((field) => (
                  <label key={field.field_key} className="block">
                    <span className="text-sm font-medium text-ink">
                      {field.field_name} {field.is_required ? "*" : ""}
                    </span>
                    <div className="relative">
                      <input
                        className={`${inputStyles} pr-14 text-lg`}
                        inputMode="decimal"
                        pattern="^[0-9]+([.][0-9]{1,2})?$"
                        type="text"
                        value={values[field.field_key] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.field_key]: event.target.value,
                          }))
                        }
                      />
                      <span className="pointer-events-none absolute bottom-3 right-3 text-sm text-muted">
                        {field.unit_hint || (unit === "INCH" ? "in" : "cm")}
                      </span>
                    </div>
                    {field.description ? (
                      <span className="mt-1 block text-xs text-muted">
                        {field.description}
                      </span>
                    ) : null}
                    {fieldErrors[field.field_key] ? (
                      <span className="mt-1 block text-sm text-red-700">
                        {fieldErrors[field.field_key]}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : null}
            {apiError ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {apiError}
              </div>
            ) : null}
            <div className="mt-7 border-t border-border pt-5">
              <button
                className={buttonStyles({
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Save measurement profile
              </button>
            </div>
          </Card>
        </form>
      ) : null}
    </PageContainer>
  );
}
