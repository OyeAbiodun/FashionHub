import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";

import { resetPassword } from "../api/auth";
import { getApiErrorMessage } from "../api/client";
import { buttonStyles, errorTextStyles, inputStyles } from "../components/ui";
import { resetPasswordSchema, type ResetPasswordFormValues } from "../lib/validation";

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

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get("token") || "";

  const [apiError, setApiError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: initialToken,
    },
  });

  const newPasswordValue = watch("new_password") || "";
  const strength = calculatePasswordStrength(newPasswordValue);

  async function onSubmit(values: ResetPasswordFormValues) {
    setApiError("");
    try {
      await resetPassword(values.token.trim(), values.new_password);
      setIsSuccess(true);
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>

      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Set new password
      </h2>
      <p className="mt-2 text-sm text-muted">
        Choose a strong, secure password for your FashionOS account.
      </p>

      {isSuccess ? (
        <div className="mt-6 space-y-4 rounded-lg bg-emerald-50 p-5 border border-emerald-200" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-emerald-900">
                Password reset complete!
              </h3>
              <p className="mt-1 text-sm text-emerald-700">
                Your password has been successfully updated. You can now sign in with your new credentials.
              </p>
            </div>
          </div>
          <div className="pt-3 border-t border-emerald-200">
            <Link
              to="/login"
              className={buttonStyles({
                size: "lg",
                className: "w-full text-center flex justify-center items-center gap-2",
              })}
            >
              Sign in with new password
            </Link>
          </div>
        </div>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {!initialToken ? (
            <label className="block">
              <span className="text-sm font-medium text-ink">Reset Token</span>
              <div className="relative mt-1">
                <input
                  id="reset-token"
                  className={inputStyles}
                  type="text"
                  placeholder="Paste your reset token here"
                  aria-invalid={Boolean(errors.token)}
                  aria-describedby={errors.token ? "reset-token-error" : undefined}
                  {...register("token")}
                />
              </div>
              {errors.token ? (
                <span id="reset-token-error" className={errorTextStyles}>
                  {errors.token.message}
                </span>
              ) : null}
            </label>
          ) : (
            <input type="hidden" {...register("token")} />
          )}

          <label className="block">
            <span className="text-sm font-medium text-ink">New Password</span>
            <div className="relative mt-1">
              <input
                id="reset-new-password"
                className={`${inputStyles} pr-10`}
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.new_password)}
                aria-describedby={errors.new_password ? "reset-new-password-error" : undefined}
                {...register("new_password")}
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
            {errors.new_password ? (
              <span id="reset-new-password-error" className={errorTextStyles}>
                {errors.new_password.message}
              </span>
            ) : null}

            {newPasswordValue ? (
              <div className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Password strength:
                  </span>
                  <span className="font-medium text-ink">{strength.label}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Confirm New Password</span>
            <div className="relative mt-1">
              <input
                id="reset-confirm-password"
                className={`${inputStyles} pr-10`}
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirm_password)}
                aria-describedby={errors.confirm_password ? "reset-confirm-password-error" : undefined}
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
              <span id="reset-confirm-password-error" className={errorTextStyles}>
                {errors.confirm_password.message}
              </span>
            ) : null}
          </label>

          {apiError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {apiError}
            </div>
          ) : null}

          <button
            className={buttonStyles({ size: "lg", className: "w-full flex justify-center items-center gap-2" })}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4" aria-hidden="true" />
            )}
            Reset password
          </button>
        </form>
      )}
    </div>
  );
}
