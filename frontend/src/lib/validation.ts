import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
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

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;

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
    .url("Enter a valid http(s) logo URL")
    .refine((value) => /^https?:\/\//i.test(value), "Use an http(s) logo URL")
    .or(z.literal("")),
  currency: z.enum(supportedCurrencies),
  timezone: z.enum(supportedTimezones),
  invoice_notes: z.string().max(5000),
  invoice_footer: z.string().max(2000),
});

export type BusinessSettingsFormValues = z.infer<typeof businessSettingsSchema>;
