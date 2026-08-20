import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, User } from "lucide-react";
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

function calculatePasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "bg-slate-200" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score, label: "Weak", color: "bg-amber-500" };
  if (score <= 4) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerAccount } = useAuth();
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [apiError, setApiError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const passwordValue = watch("password") || "";
  const passwordStrength = calculatePasswordStrength(passwordValue);

  async function handleNextStep() {
    setApiError("");
    const isStep1Valid = await trigger([
      "first_name",
      "last_name",
      "email",
      "phone",
      "password",
      "confirm_password",
    ]);
    if (isStep1Valid) {
      setCurrentStep(2);
    }
  }

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
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Create your FashionOS account
      </h2>
      <p className="mt-1 text-sm text-muted">
        Set up your account and tailored workspace in two quick steps.
      </p>

      {/* Step Indicator Header */}
      <div className="mt-6 grid grid-cols-2 gap-3 border-b border-slate-100 pb-5">
        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          className={`flex items-center gap-2.5 text-left rounded-lg p-2.5 transition-colors ${
            currentStep === 1
              ? "bg-slate-50 border border-slate-200"
              : "opacity-70 hover:opacity-100"
          }`}
        >
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              currentStep === 1
                ? "bg-primary text-white"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {currentStep === 2 ? <CheckCircle2 className="h-4 w-4" /> : "1"}
          </div>
          <div>
            <p className="text-xs font-semibold text-ink flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-muted" /> Owner Details
            </p>
            <p className="text-[11px] text-muted">Personal credentials</p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleNextStep}
          className={`flex items-center gap-2.5 text-left rounded-lg p-2.5 transition-colors ${
            currentStep === 2
              ? "bg-slate-50 border border-slate-200"
              : "opacity-70 hover:opacity-100"
          }`}
        >
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              currentStep === 2
                ? "bg-primary text-white"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            2
          </div>
          <div>
            <p className="text-xs font-semibold text-ink flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-muted" /> Business Details
            </p>
            <p className="text-[11px] text-muted">Fashion house profile</p>
          </div>
        </button>
      </div>

      <form
        className="mt-6 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className={currentStep === 1 ? "space-y-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="First name"
              placeholder="Ada"
              error={errors.first_name?.message}
              {...register("first_name")}
            />
            <TextField
              label="Last name"
              placeholder="Obi"
              error={errors.last_name?.message}
              {...register("last_name")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Email"
              type="email"
              placeholder="owner@adabespoke.ng"
              error={errors.email?.message}
              {...register("email")}
            />
            <TextField
              label="Personal Phone (optional)"
              placeholder="Personal phone e.g. +234 801 234 5678"
              error={errors.phone?.message}
              {...register("phone")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Password</span>
              <div className="relative mt-1">
                <input
                  id="register-password"
                  className={`${inputStyles} pr-10`}
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "register-password-error" : undefined}
                  {...register("password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? (
                <span id="register-password-error" className={errorTextStyles}>
                  {errors.password.message}
                </span>
              ) : null}

              {passwordValue ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Strength:
                    </span>
                    <span className="font-medium text-ink">{passwordStrength.label}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Confirm Password</span>
              <div className="relative mt-1">
                <input
                  id="register-confirm-password"
                  className={`${inputStyles} pr-10`}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirm_password)}
                  aria-describedby={errors.confirm_password ? "register-confirm-password-error" : undefined}
                  {...register("confirm_password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirm_password ? (
                <span id="register-confirm-password-error" className={errorTextStyles}>
                  {errors.confirm_password.message}
                </span>
              ) : null}
            </label>
          </div>

          <div className="pt-2">
            <button
              type="button"
              className={buttonStyles({ size: "lg", className: "w-full flex justify-center items-center gap-2" })}
              onClick={handleNextStep}
            >
              Continue to Business Details
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className={currentStep === 2 ? "space-y-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Business name"
              placeholder="Ada Bespoke Couture"
              error={errors.business_name?.message}
              {...register("business_name")}
            />
            <TextField
              label="Business phone"
              placeholder="Business phone e.g. +234 801 234 5678"
              error={errors.business_phone?.message}
              {...register("business_phone")}
            />
          </div>

          <TextField
            label="Business email (optional)"
            type="email"
            placeholder="contact@adabespoke.ng"
            error={errors.business_email?.message}
            {...register("business_email")}
          />

          <label className="block">
            <span className="text-sm font-medium text-ink">
              Business address (optional)
            </span>
            <textarea
              id="business-address"
              className={textareaStyles}
              placeholder="12 Fashion Avenue, Victoria Island, Lagos"
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

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              className={buttonStyles({ variant: "outline", size: "lg", className: "flex items-center gap-1.5" })}
              onClick={() => setCurrentStep(1)}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              className={buttonStyles({ size: "lg", className: "flex-1 flex justify-center items-center gap-2" })}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create account
            </button>
          </div>
        </div>
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
