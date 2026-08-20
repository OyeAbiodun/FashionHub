import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { forgotPassword } from "../api/auth";
import { getApiErrorMessage } from "../api/client";
import { buttonStyles, errorTextStyles, inputStyles } from "../components/ui";
import { forgotPasswordSchema, type ForgotPasswordFormValues } from "../lib/validation";

export function ForgotPasswordPage() {
  const [apiError, setApiError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [devResetToken, setDevResetToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setApiError("");
    setSuccessMessage("");
    setDevResetToken(null);
    try {
      const res = await forgotPassword(values.email);
      setSuccessMessage(res.message);
      if (res.reset_token) {
        setDevResetToken(res.reset_token);
      }
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
        Reset your password
      </h2>
      <p className="mt-2 text-sm text-muted">
        Enter the email address registered to your FashionOS workspace.
      </p>

      {successMessage ? (
        <div className="mt-6 space-y-4 rounded-lg bg-emerald-50 p-4 border border-emerald-200">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-900">{successMessage}</p>
              <p className="mt-1 text-xs text-emerald-700">
                Check your inbox for instructions to update your credentials.
              </p>
            </div>
          </div>
          {devResetToken ? (
            <div className="pt-3 border-t border-emerald-200">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                Development Quick Reset Link
              </p>
              <Link
                to={`/reset-password?token=${encodeURIComponent(devResetToken)}`}
                className={buttonStyles({
                  size: "sm",
                  variant: "outline",
                  className: "mt-2 text-xs bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100",
                })}
              >
                Reset Password Now (Local Test)
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <label className="block">
            <span className="text-sm font-medium text-ink">Registered Email</span>
            <input
              id="forgot-email"
              className={inputStyles}
              type="email"
              placeholder="owner@yourfashionhouse.com"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "forgot-email-error" : undefined}
              {...register("email")}
            />
            {errors.email ? (
              <span id="forgot-email-error" className={errorTextStyles}>
                {errors.email.message}
              </span>
            ) : null}
          </label>
          {apiError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
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
            Send reset instructions
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Remembered your password?{" "}
        <Link className="font-semibold text-primary hover:underline" to="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
