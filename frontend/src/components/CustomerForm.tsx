import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { forwardRef, InputHTMLAttributes, useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { Customer, CustomerCreateInput } from "../types/customer";
import {
  buttonStyles,
  errorTextStyles,
  inputStyles,
  labelStyles,
  textareaStyles,
} from "./ui";

const optionalEmail = z
  .string()
  .email("Enter a valid email")
  .optional()
  .or(z.literal(""));

const customerFormSchema = z.object({
  first_name: z
    .string({ required_error: "First name is required" })
    .min(1, "First name is required")
    .max(100),
  last_name: z.string().max(100).optional(),
  phone: z
    .string({ required_error: "Phone is required" })
    .min(1, "Phone is required")
    .max(40),
  alternate_phone: z.string().max(40).optional(),
  email: optionalEmail,
  gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
  birthday: z.string().optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

interface CustomerFormProps {
  customer?: Customer;
  apiError?: string;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: CustomerCreateInput) => Promise<void>;
}

export function CustomerForm({
  customer,
  apiError,
  submitLabel,
  isSubmitting,
  onSubmit,
}: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: toFormValues(customer),
  });

  useEffect(() => {
    reset(toFormValues(customer));
  }, [customer, reset]);

  async function submit(values: CustomerFormValues) {
    await onSubmit({
      first_name: values.first_name,
      last_name: emptyToNull(values.last_name),
      phone: values.phone,
      alternate_phone: emptyToNull(values.alternate_phone),
      email: emptyToNull(values.email),
      gender: emptyToNull(values.gender),
      birthday: emptyToNull(values.birthday),
      address: emptyToNull(values.address),
      notes: emptyToNull(values.notes),
    });
  }

  return (
    <form className="space-y-7" onSubmit={handleSubmit(submit)} noValidate>
      <fieldset>
        <legend className="text-base font-semibold text-ink">
          Personal information
        </legend>
        <p className="mt-1 text-sm text-muted">
          Core details used across orders, measurements, and invoices.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TextField
            label="First name"
            error={errors.first_name?.message}
            {...register("first_name")}
          />
          <TextField
            label="Last name optional"
            error={errors.last_name?.message}
            {...register("last_name")}
          />
          <TextField
            label="Phone"
            type="tel"
            error={errors.phone?.message}
            {...register("phone")}
          />
          <TextField
            label="Alternate phone optional"
            type="tel"
            error={errors.alternate_phone?.message}
            {...register("alternate_phone")}
          />
          <TextField
            label="Email optional"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <label className="block">
            <span className="text-sm font-medium text-ink">Gender optional</span>
            <select className="mt-2 h-11 w-full rounded-lg border border-border bg-white px-3 text-ink shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" {...register("gender")}>
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            {errors.gender?.message ? <span className="mt-1 block text-sm text-danger">{errors.gender.message}</span> : null}
          </label>
          <TextField
            label="Birthday optional"
            type="date"
            error={errors.birthday?.message}
            {...register("birthday")}
          />
        </div>
      </fieldset>
      <fieldset className="border-t border-border pt-7">
        <legend className="text-base font-semibold text-ink">
          Additional context
        </legend>
        <p className="mt-1 text-sm text-muted">
          Optional information that helps the workroom serve this customer well.
        </p>
        <div className="mt-5 space-y-5">
          <label className="block">
            <span className={labelStyles}>Address optional</span>
            <textarea className={textareaStyles} {...register("address")} />
            {errors.address ? (
              <span className={errorTextStyles}>{errors.address.message}</span>
            ) : null}
          </label>
          <label className="block">
            <span className={labelStyles}>Notes optional</span>
            <textarea className={textareaStyles} {...register("notes")} />
            {errors.notes ? (
              <span className={errorTextStyles}>{errors.notes.message}</span>
            ) : null}
          </label>
        </div>
      </fieldset>
      {apiError ? (
        <div
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {apiError}
        </div>
      ) : null}
      <button
        className={buttonStyles({
          size: "lg",
          className: "w-full sm:w-auto sm:min-w-44",
        })}
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
        {submitLabel}
      </button>
    </form>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ label, error, ...props }, ref) {
    const generatedId = useId();
    const inputId = props.id ?? generatedId;
    const errorId = `${inputId}-error`;
    return (
      <label className="block">
        <span className={labelStyles}>{label}</span>
        <input
          ref={ref}
          id={inputId}
          className={inputStyles}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        {error ? (
          <span id={errorId} className={errorTextStyles}>
            {error}
          </span>
        ) : null}
      </label>
    );
  },
);

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function toFormValues(customer?: Customer): CustomerFormValues {
  return {
    first_name: customer?.first_name ?? "",
    last_name: customer?.last_name ?? "",
    phone: customer?.phone ?? "",
    alternate_phone: customer?.alternate_phone ?? "",
    email: customer?.email ?? "",
    gender: customer?.gender?.toUpperCase() === "MALE" ? "MALE" : customer?.gender?.toUpperCase() === "FEMALE" ? "FEMALE" : "",
    birthday: customer?.birthday ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
  };
}
