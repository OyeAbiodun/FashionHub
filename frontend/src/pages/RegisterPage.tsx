import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { registerSchema, type RegisterFormValues } from "../lib/validation";
import {
  buttonStyles,
  errorTextStyles,
  inputStyles,
  textareaStyles,
} from "../components/ui";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerAccount } = useAuth();
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterFormValues) {
    setApiError("");
    try {
      await registerAccount({
        user: {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone || undefined,
          password: values.password,
        },
        business: {
          name: values.business_name,
          phone: values.business_phone,
          email: values.business_email || undefined,
          address: values.business_address || undefined,
        },
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Start your workspace
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Create your FashionOS account
      </h2>
      <form
        className="mt-8 space-y-6"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            error={errors.first_name?.message}
            {...register("first_name")}
          />
          <TextField
            label="Last name"
            error={errors.last_name?.message}
            {...register("last_name")}
          />
          <TextField
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <TextField
            label="Phone optional"
            error={errors.phone?.message}
            {...register("phone")}
          />
          <TextField
            label="Password"
            type="password"
            error={errors.password?.message}
            {...register("password")}
          />
          <TextField
            label="Business name"
            error={errors.business_name?.message}
            {...register("business_name")}
          />
          <TextField
            label="Business phone"
            error={errors.business_phone?.message}
            {...register("business_phone")}
          />
          <TextField
            label="Business email optional"
            type="email"
            error={errors.business_email?.message}
            {...register("business_email")}
          />
        </div>
        <label className="block">
          <span className="text-sm font-medium text-ink">
            Business address optional
          </span>
          <textarea
            id="business-address"
            className={textareaStyles}
            aria-invalid={Boolean(errors.business_address)}
            aria-describedby={
              errors.business_address ? "business-address-error" : undefined
            }
            {...register("business_address")}
          />
          {errors.business_address ? (
            <span id="business-address-error" className={errorTextStyles}>
              {errors.business_address.message}
            </span>
          ) : null}
        </label>
        {apiError ? (
          <div
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {apiError}
          </div>
        ) : null}
        <button
          className={buttonStyles({ size: "lg", className: "w-full" })}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          className="font-semibold text-primary hover:underline"
          to="/login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
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
        <span className="text-sm font-medium text-ink">{label}</span>
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
