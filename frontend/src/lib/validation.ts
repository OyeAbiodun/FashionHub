import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerStep1Schema = z
  .object({
    first_name: z
      .string({ required_error: "First name is required" })
      .min(1, "First name is required")
      .max(100),
    last_name: z
      .string({ required_error: "Last name is required" })
      .min(1, "Last name is required")
      .max(100),
    email: z
      .string({ required_error: "Email is required" })
      .email("Enter a valid email address"),
    phone: z.string().max(40).optional(),
    password: z
      .string({ required_error: "Password must be at least 8 characters" })
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirm_password: z
      .string({ required_error: "Confirm your password" })
      .min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const registerStep2Schema = z.object({
  business_name: z
    .string({ required_error: "Business name is required" })
    .min(1, "Business name is required")
    .max(200),
  business_phone: z
    .string({ required_error: "Business phone is required" })
    .min(1, "Business phone is required")
    .max(40),
  business_email: z
    .string()
    .email("Enter a valid business email")
    .optional()
    .or(z.literal("")),
  business_address: z.string().max(500).optional(),
});

export const registerSchema = registerStep1Schema
  .innerType()
  .merge(registerStep2Schema)
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    new_password: z
      .string({ required_error: "Password must be at least 8 characters" })
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirm_password: z
      .string({ required_error: "Confirm your new password" })
      .min(1, "Confirm your new password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export const userProfileSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z
      .string({ required_error: "Password must be at least 8 characters" })
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirm_password: z
      .string({ required_error: "Confirm your new password" })
      .min(1, "Confirm your new password"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type UserProfileFormValues = z.infer<typeof userProfileSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export const supportedCurrencies = [
  "NGN",
  "USD",
  "GBP",
  "EUR",
  "GHS",
  "KES",
  "ZAR",
] as const;

export const supportedTimezones = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
] as const;

export const businessSettingsSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  phone: z.string().trim().min(1, "Business phone is required").max(40),
  email: z.string().email("Enter a valid business email").or(z.literal("")),
  address: z.string().max(500),
  logo_url: z
    .string()
    .refine(
      (value) => !value || /^https?:\/\//i.test(value) || /^data:image\//i.test(value),
      "Use an http(s) logo URL or uploaded image file",
    )
    .or(z.literal("")),
  currency: z.enum(supportedCurrencies),
  timezone: z.enum(supportedTimezones),
  invoice_notes: z.string().max(5000),
  invoice_footer: z.string().max(2000),
});

export type BusinessSettingsFormValues = z.infer<typeof businessSettingsSchema>;
