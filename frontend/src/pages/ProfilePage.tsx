import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Eye, EyeOff, Loader2, Lock, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { changePassword } from "../api/auth";
import { getApiErrorMessage } from "../api/client";
import {
  Button,
  Card,
  InlineError,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SuccessNotice,
  buttonStyles,
  errorTextStyles,
  helpTextStyles,
  inputStyles,
  labelStyles,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import {
  changePasswordSchema,
  userProfileSchema,
  type ChangePasswordFormValues,
  type UserProfileFormValues,
} from "../lib/validation";

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

export function ProfilePage() {
  const { user, business, updateProfile } = useAuth();

  const [profileApiError, setProfileApiError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [passwordApiError, setPasswordApiError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const profileForm = useForm<UserProfileFormValues>({
    resolver: zodResolver(userProfileSchema),
  });

  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone ?? "",
    });
  }, [profileForm, user]);

  const newPasswordValue = passwordForm.watch("new_password") || "";
  const passwordStrength = calculatePasswordStrength(newPasswordValue);

  async function onSaveProfile(values: UserProfileFormValues) {
    setProfileApiError("");
    setProfileSuccess(false);
    try {
      await updateProfile({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone?.trim() || null,
      });
      setProfileSuccess(true);
    } catch (error) {
      setProfileApiError(getApiErrorMessage(error));
    }
  }

  async function onChangePassword(values: ChangePasswordFormValues) {
    setPasswordApiError("");
    setPasswordSuccess(false);
    try {
      await changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      passwordForm.reset({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      setPasswordSuccess(true);
    } catch (error) {
      setPasswordApiError(getApiErrorMessage(error));
    }
  }

  if (!user) {
    return null;
  }

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        eyebrow="Account"
        title="User Profile & Security"
        description="Manage your personal details, credentials, and password."
      />

      <div className="mt-7 space-y-6">
        {/* Section 1: Profile Details */}
        <Card className="p-5 sm:p-7">
          <SectionHeader
            title="Personal Details"
            description="Your user profile information across FashionOS."
          />

          <form
            className="mt-5 space-y-5"
            onSubmit={profileForm.handleSubmit(onSaveProfile)}
            noValidate
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className={labelStyles}>First name</span>
                <input
                  className={inputStyles}
                  {...profileForm.register("first_name")}
                />
                {profileForm.formState.errors.first_name ? (
                  <span className={errorTextStyles}>
                    {profileForm.formState.errors.first_name.message}
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className={labelStyles}>Last name</span>
                <input
                  className={inputStyles}
                  {...profileForm.register("last_name")}
                />
                {profileForm.formState.errors.last_name ? (
                  <span className={errorTextStyles}>
                    {profileForm.formState.errors.last_name.message}
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className={labelStyles}>Email address</span>
                <input
                  className={`${inputStyles} bg-slate-100 text-slate-600 cursor-not-allowed`}
                  value={user.email}
                  disabled
                />
                <span className={helpTextStyles}>
                  Email address is linked to account authentication and cannot be changed directly.
                </span>
              </label>

              <label className="block">
                <span className={labelStyles}>Personal Phone (optional)</span>
                <input
                  className={inputStyles}
                  placeholder="+234 801 234 5678"
                  {...profileForm.register("phone")}
                />
                {profileForm.formState.errors.phone ? (
                  <span className={errorTextStyles}>
                    {profileForm.formState.errors.phone.message}
                  </span>
                ) : null}
              </label>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Account Role:</span>
                <StatusBadge status="ACTIVE" label={user.role} />
              </div>

              <Button
                type="submit"
                disabled={profileForm.formState.isSubmitting || !profileForm.formState.isDirty}
              >
                {profileForm.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Save Profile
              </Button>
            </div>

            {profileApiError ? <InlineError message={profileApiError} /> : null}
            {profileSuccess ? <SuccessNotice>Profile updated successfully.</SuccessNotice> : null}
          </form>
        </Card>

        {/* Section 2: Change Password */}
        <Card className="p-5 sm:p-7">
          <SectionHeader
            title="Account Security"
            description="Update your password to keep your FashionOS account secure."
          />

          <form
            className="mt-5 space-y-5 max-w-2xl"
            onSubmit={passwordForm.handleSubmit(onChangePassword)}
            noValidate
          >
            <label className="block">
              <span className={labelStyles}>Current Password</span>
              <div className="relative mt-1">
                <input
                  className={`${inputStyles} pr-10`}
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  {...passwordForm.register("current_password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.current_password ? (
                <span className={errorTextStyles}>
                  {passwordForm.formState.errors.current_password.message}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className={labelStyles}>New Password</span>
              <div className="relative mt-1">
                <input
                  className={`${inputStyles} pr-10`}
                  type={showNewPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  {...passwordForm.register("new_password")}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink focus:outline-none"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.new_password ? (
                <span className={errorTextStyles}>
                  {passwordForm.formState.errors.new_password.message}
                </span>
              ) : null}

              {newPasswordValue ? (
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Password strength:
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
              <span className={labelStyles}>Confirm New Password</span>
              <div className="relative mt-1">
                <input
                  className={`${inputStyles} pr-10`}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  {...passwordForm.register("confirm_password")}
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
              {passwordForm.formState.errors.confirm_password ? (
                <span className={errorTextStyles}>
                  {passwordForm.formState.errors.confirm_password.message}
                </span>
              ) : null}
            </label>

            {passwordApiError ? <InlineError message={passwordApiError} /> : null}
            {passwordSuccess ? <SuccessNotice>Password changed successfully.</SuccessNotice> : null}

            <div className="pt-2">
              <Button
                type="submit"
                disabled={passwordForm.formState.isSubmitting}
              >
                {passwordForm.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                )}
                Update Password
              </Button>
            </div>
          </form>
        </Card>

        {/* Section 3: Fashion House Identity */}
        {business ? (
          <Card className="p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <SectionHeader
                  title="Fashion House Identity"
                  description="Your connected business settings and regional currency defaults."
                />
                <div className="mt-4 space-y-1 text-sm text-ink">
                  <p className="font-semibold">{business.name}</p>
                  <p className="text-muted">{business.phone} • {business.currency} ({business.timezone})</p>
                </div>
              </div>

              <Link
                to="/settings"
                className={buttonStyles({ variant: "outline", className: "inline-flex items-center gap-2" })}
              >
                <Building2 className="h-4 w-4" />
                Manage Business Settings
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}
