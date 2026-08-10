import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { loginSchema, type LoginFormValues } from "../lib/validation";
import { buttonStyles, errorTextStyles, inputStyles } from "../components/ui";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setApiError("");
    try {
      await login(values);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Welcome back
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Sign in to FashionOS
      </h2>
      <form
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <label className="block">
          <span className="text-sm font-medium text-ink">Email</span>
          <input
            id="login-email"
            className={inputStyles}
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            {...register("email")}
          />
          {errors.email ? (
            <span id="login-email-error" className={errorTextStyles}>
              {errors.email.message}
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Password</span>
          <input
            id="login-password"
            className={inputStyles}
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password ? "login-password-error" : undefined
            }
            {...register("password")}
          />
          {errors.password ? (
            <span id="login-password-error" className={errorTextStyles}>
              {errors.password.message}
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
          Sign in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to FashionOS?{" "}
        <Link
          className="font-semibold text-primary hover:underline"
          to="/register"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
