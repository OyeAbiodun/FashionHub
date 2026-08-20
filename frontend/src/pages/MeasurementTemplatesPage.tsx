import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Copy,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import {
  Button,
  Card,
  EmptyState,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
  StatusBadge,
  inputStyles,
  textareaStyles,
} from "../components/ui";
import {
  useCreateMeasurementTemplate,
  useDeleteMeasurementTemplate,
  useMeasurementTemplate,
  useMeasurementTemplates,
  useUpdateMeasurementTemplate,
} from "../hooks/useMeasurements";
import type {
  CreateMeasurementTemplateInput,
  MeasurementFieldType,
  MeasurementTemplate,
  MeasurementTemplateField,
} from "../types/measurement";

interface FieldDraft {
  id?: string | null;
  field_name: string;
  field_key: string;
  description: string;
  field_type: MeasurementFieldType;
  position: number;
  is_required: boolean;
  unit_hint: string;
  default_value: string;
  is_active: boolean;
}

interface TemplateDraft {
  id?: string;
  name: string;
  garment_type: string;
  description: string;
  fields: FieldDraft[];
}

const emptyDraft: TemplateDraft = {
  name: "",
  garment_type: "",
  description: "",
  fields: [blankField(1)],
};

function blankField(position: number): FieldDraft {
  return {
    field_name: "",
    field_key: "",
    description: "",
    field_type: "NUMBER",
    position,
    is_required: true,
    unit_hint: "inches",
    default_value: "",
    is_active: true,
  };
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function draftFromTemplate(template: MeasurementTemplate): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    garment_type: template.garment_type,
    description: template.description ?? "",
    fields: template.fields
      .slice()
      .sort((first, second) => first.position - second.position)
      .map(fieldFromTemplate),
  };
}

function fieldFromTemplate(field: MeasurementTemplateField): FieldDraft {
  return {
    id: field.id,
    field_name: field.field_name,
    field_key: field.field_key,
    description: field.description ?? "",
    field_type: field.field_type,
    position: field.position,
    is_required: field.is_required,
    unit_hint: field.unit_hint ?? "",
    default_value: field.default_value ?? "",
    is_active: field.is_active,
  };
}

function toPayload(draft: TemplateDraft): CreateMeasurementTemplateInput {
  return {
    name: draft.name.trim(),
    garment_type: draft.garment_type.trim(),
    description: draft.description.trim() || null,
    fields: draft.fields.map((field, index) => ({
      id: field.id ?? null,
      field_name: field.field_name.trim(),
      field_key: field.field_key.trim() || slug(field.field_name),
      description: field.description.trim() || null,
      field_type: field.field_type,
      position: index + 1,
      is_required: field.is_required,
      unit_hint: field.unit_hint.trim() || null,
      default_value: field.default_value.trim() || null,
      is_active: field.is_active,
    })),
  };
}

function validateDraft(draft: TemplateDraft): string | null {
  if (!draft.name.trim()) return "Template name is required.";
  if (!draft.garment_type.trim()) return "Garment type is required.";
  if (draft.fields.length === 0) return "Add at least one measurement field.";
  const keys = new Set<string>();
  for (const field of draft.fields) {
    if (!field.field_name.trim()) return "Every field needs a label.";
    const key = field.field_key.trim() || slug(field.field_name);
    if (!key) return "Every field needs a key.";
    if (keys.has(key)) return `Duplicate field key: ${key}`;
    keys.add(key);
  }
  return null;
}

export function MeasurementTemplatesPage() {
  const templatesQuery = useMeasurementTemplates();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [formError, setFormError] = useState("");
  const selectedTemplate = useMeasurementTemplate(
    mode === "edit" ? selectedId : undefined,
  );
  const createMutation = useCreateMeasurementTemplate();
  const updateMutation = useUpdateMeasurementTemplate(draft.id ?? "");
  const deleteMutation = useDeleteMeasurementTemplate();

  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const selectedListItem = useMemo(
    () => templates.find((template) => template.id === selectedId),
    [selectedId, templates],
  );

  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!hasInitialized && templates.length > 0) {
      setSelectedId(templates[0].id);
      setMode("edit");
      setHasInitialized(true);
    }
  }, [hasInitialized, templates]);

  useEffect(() => {
    if (mode === "edit" && selectedTemplate.data) {
      setDraft(draftFromTemplate(selectedTemplate.data));
      setFormError("");
    }
  }, [mode, selectedTemplate.data]);

  function startCreate() {
    setMode("create");
    setSelectedId("");
    setDraft({ ...emptyDraft, fields: [blankField(1)] });
    setFormError("");
  }

  function duplicateCurrent() {
    if (!selectedTemplate.data) return;
    const copied = draftFromTemplate(selectedTemplate.data);
    setMode("create");
    setSelectedId("");
    setDraft({
      ...copied,
      id: undefined,
      name: `Copy of ${copied.name}`,
      fields: copied.fields.map((field) => ({ ...field, id: null })),
    });
    setFormError("");
  }

  function selectTemplate(templateId: string) {
    setSelectedId(templateId);
    setMode("edit");
    setFormError("");
  }

  function updateField(index: number, patch: Partial<FieldDraft>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    }));
  }

  function addField() {
    setDraft((current) => ({
      ...current,
      fields: [...current.fields, blankField(current.fields.length + 1)],
    }));
  }

  function removeField(index: number) {
    setDraft((current) => ({
      ...current,
      fields: current.fields
        .filter((_, fieldIndex) => fieldIndex !== index)
        .map((field, fieldIndex) => ({ ...field, position: fieldIndex + 1 })),
    }));
  }

  function moveField(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      const [field] = fields.splice(index, 1);
      fields.splice(nextIndex, 0, field);
      return {
        ...current,
        fields: fields.map((item, fieldIndex) => ({
          ...item,
          position: fieldIndex + 1,
        })),
      };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const validationError = validateDraft(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");
    try {
      const payload = toPayload(draft);
      const saved =
        mode === "edit" && draft.id
          ? await updateMutation.mutateAsync(payload)
          : await createMutation.mutateAsync(payload);
      setSelectedId(saved.id);
      setMode("edit");
    } catch (error) {
      setFormError(getApiErrorMessage(error));
    }
  }

  async function archiveCurrent() {
    if (!draft.id) return;
    setFormError("");
    try {
      await deleteMutation.mutateAsync(draft.id);
      const fallback = templates.find((template) => template.id !== draft.id);
      if (fallback) {
        selectTemplate(fallback.id);
      } else {
        startCreate();
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error));
    }
  }

  return (
    <PageContainer className="max-w-7xl">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to="/measurements"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Measurement Vault
      </Link>
      <div className="mt-5">
        <PageHeader
          title="Measurement Templates"
          description="Create and edit the field sets used when recording customer measurements."
          actions={
            <Button type="button" onClick={startCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New Template
            </Button>
          }
        />
      </div>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold text-ink">Templates</h2>
          </div>
          {templatesQuery.isLoading ? (
            <div className="space-y-2 p-4" aria-label="Loading templates">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : null}
          {templatesQuery.isError ? (
            <div className="p-4">
              <InlineError
                message="Could not load measurement templates."
                retry={() => void templatesQuery.refetch()}
              />
            </div>
          ) : null}
          {!templatesQuery.isLoading && templates.length === 0 ? (
            <EmptyState
              compact
              icon={Plus}
              title="No templates yet"
              description="Create a template to start capturing custom measurement fields."
              action={
                <Button type="button" onClick={startCreate}>
                  New Template
                </Button>
              }
            />
          ) : null}
          {templates.length > 0 ? (
            <div className="divide-y divide-border">
              {templates.map((template) => (
                <button
                  key={template.id}
                  className={`block w-full px-4 py-3 text-left transition hover:bg-stone-50 ${
                    template.id === selectedId ? "bg-primary-soft/50" : ""
                  }`}
                  type="button"
                  onClick={() => selectTemplate(template.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{template.name}</span>
                    {template.is_system_template ? (
                      <StatusBadge status="INFO" label="Default" />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {template.garment_type}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </Card>

        <form className="space-y-6" onSubmit={save}>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {mode === "create" ? "Create template" : "Edit template"}
                </h2>
                {selectedListItem ? (
                  <p className="mt-1 text-sm text-muted">
                    {selectedListItem.is_system_template
                      ? "Default template copy for this business."
                      : "Custom template for this business."}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {mode === "edit" ? (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={duplicateCurrent}
                    disabled={!selectedTemplate.data}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" /> Duplicate
                  </Button>
                ) : null}
                {mode === "edit" ? (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() =>
                      selectedTemplate.data
                        ? setDraft(draftFromTemplate(selectedTemplate.data))
                        : undefined
                    }
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button variant="outline" type="button" onClick={startCreate}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-ink">Name</span>
                <input
                  className={inputStyles}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                <span className="text-sm font-medium text-ink">Garment type</span>
                <input
                  className={inputStyles}
                  value={draft.garment_type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      garment_type: event.target.value.toUpperCase(),
                    }))
                  }
                  required
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-sm font-medium text-ink">Description</span>
                <textarea
                  className={textareaStyles}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Fields</h2>
                <p className="mt-1 text-sm text-muted">
                  Fields are saved in this order and rendered dynamically on new measurement forms.
                </p>
              </div>
              <Button variant="outline" type="button" onClick={addField}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Field
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              {draft.fields.map((field, index) => (
                <div
                  key={`${field.id ?? "new"}-${index}`}
                  className="rounded-lg border border-border bg-stone-50/60 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-semibold text-ink">
                      {field.field_name || `Field ${index + 1}`}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label="Move field up"
                        disabled={index === 0}
                        onClick={() => moveField(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label="Move field down"
                        disabled={index === draft.fields.length - 1}
                        onClick={() => moveField(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label="Remove field"
                        onClick={() => removeField(index)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label>
                      <span className="text-sm font-medium text-ink">Label</span>
                      <input
                        className={inputStyles}
                        value={field.field_name}
                        onChange={(event) => {
                          const label = event.target.value;
                          const fieldKey =
                            !field.field_key ||
                            field.field_key === slug(field.field_name)
                              ? slug(label)
                              : field.field_key;
                          updateField(index, {
                            field_name: label,
                            field_key: fieldKey,
                          });
                        }}
                        required
                      />
                    </label>
                    <label>
                      <span className="text-sm font-medium text-ink">Key</span>
                      <input
                        className={inputStyles}
                        value={field.field_key}
                        onChange={(event) =>
                          updateField(index, {
                            field_key: slug(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span className="text-sm font-medium text-ink">Unit</span>
                      <input
                        className={inputStyles}
                        value={field.unit_hint}
                        onChange={(event) =>
                          updateField(index, { unit_hint: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span className="text-sm font-medium text-ink">Type</span>
                      <select
                        className={inputStyles}
                        value={field.field_type}
                        onChange={(event) =>
                          updateField(index, {
                            field_type: event.target.value as MeasurementFieldType,
                          })
                        }
                      >
                        <option value="NUMBER">Number</option>
                      </select>
                    </label>
                    <label>
                      <span className="text-sm font-medium text-ink">Default</span>
                      <input
                        className={inputStyles}
                        inputMode="decimal"
                        pattern="^[0-9]+([.][0-9]{1,2})?$"
                        value={field.default_value}
                        onChange={(event) =>
                          updateField(index, {
                            default_value: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-8 text-sm font-medium text-ink">
                      <input
                        className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
                        type="checkbox"
                        checked={field.is_required}
                        onChange={(event) =>
                          updateField(index, {
                            is_required: event.target.checked,
                          })
                        }
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2 pt-8 text-sm font-medium text-ink">
                      <input
                        className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
                        type="checkbox"
                        checked={field.is_active}
                        onChange={(event) =>
                          updateField(index, {
                            is_active: event.target.checked,
                          })
                        }
                      />
                      Active
                    </label>
                    <label className="md:col-span-2 xl:col-span-4">
                      <span className="text-sm font-medium text-ink">Help text</span>
                      <textarea
                        className={textareaStyles}
                        value={field.description}
                        onChange={(event) =>
                          updateField(index, {
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {formError ? (
              <div className="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-between">
              {mode === "edit" ? (
                <Button
                  variant="destructive"
                  type="button"
                  onClick={() => void archiveCurrent()}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Archive Template
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Save Template
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </PageContainer>
  );
}
