import { z } from 'zod';

// Messages are translation keys (docs/i18n.md) — render them with
// tMessage(...) from '@/lib/i18n', never directly.

// ----- Auth -----
// Single schema covers both sign-in and sign-up. `name` is optional at the
// schema level; the login screen enforces it for sign-up via UI validation.
export const authSchema = z.object({
  email: z.string().email('auth:validation.email'),
  password: z.string().min(8, 'auth:validation.passwordMin'),
  name: z.string().max(200).optional().or(z.literal('')),
});

export type AuthForm = z.infer<typeof authSchema>;

// ----- Change password (signed-in user) -----
// Used by the Account screen.
// TEMPORARY: the current-password verification was removed at the user's
// request. To restore it, re-add `currentPassword: z.string().min(1, …)` here
// plus the "new must differ from current" refine, and re-add the current-
// password field + reauth (signInWithPassword) in account.tsx.
export const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'auth:validation.passwordMin'),
    confirmPassword: z.string().min(1, 'auth:validation.confirmPassword'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'auth:validation.passwordsMismatch',
    path: ['confirmPassword'],
  });

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

// ----- Password reset (OTP, signed-out) -----
// Two-step: request a code by email, then confirm with the code + new password.
// OTP-based so it works in Expo Go without deep linking (a magic link would
// need Associated Domains / a custom scheme — a Dev Client / Phase H concern).
export const resetRequestSchema = z.object({
  email: z.string().trim().email('auth:validation.email'),
});
export type ResetRequestForm = z.infer<typeof resetRequestSchema>;

export const resetConfirmSchema = z
  .object({
    // Length is the Supabase "Email OTP length" setting (6–10 digits); accept
    // the configured length rather than pinning to one value.
    token: z.string().trim().regex(/^\d{6,10}$/, 'auth:validation.code'),
    newPassword: z.string().min(8, 'auth:validation.passwordMin'),
    confirmPassword: z.string().min(1, 'auth:validation.confirmPassword'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'auth:validation.passwordsMismatch',
    path: ['confirmPassword'],
  });
export type ResetConfirmForm = z.infer<typeof resetConfirmSchema>;

// ----- Onboarding -----
export const businessTypeSchema = z.enum(['BARBER', 'SALON', 'SPA']);
export type BusinessType = z.infer<typeof businessTypeSchema>;

export const onboardingSchema = z.object({
  // Business
  businessName: z.string().min(1, 'auth:validation.businessNameRequired').max(200),
  businessType: businessTypeSchema,
  logoUrl: z.string().url('auth:validation.url').optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  // Location
  locationName: z.string().min(1, 'auth:validation.locationNameRequired').max(200),
  locationStreet: z.string().min(1, 'auth:validation.streetRequired').max(200),
  locationCity: z.string().min(1, 'auth:validation.cityRequired').max(100),
  locationState: z.string().length(2, 'auth:validation.stateCode'),
  locationZip: z.string().min(5, 'auth:validation.zipRequired').max(10),
  locationPhone: z.string().min(10, 'auth:validation.phoneRequired').max(20),
  timezone: z.string().min(1, 'auth:validation.timezoneRequired'),
});

export type OnboardingForm = z.infer<typeof onboardingSchema>;

// ----- Customer -----
// Mirrors the check constraints on public.customers (0001_initial_schema.sql).
// Optional text fields accept '' from the UI and are normalized to null
// before insert/update.
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'auth:validation.nameRequired').max(200),
  email: z
    .string()
    .trim()
    .email('auth:validation.email')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(20, 'auth:validation.phoneTooLong').optional().or(z.literal('')),
  notes: z
    .string()
    .trim()
    .max(2000, 'auth:validation.notesTooLong')
    .optional()
    .or(z.literal('')),
});

export type CustomerForm = z.infer<typeof customerSchema>;

// ----- Service -----
// Mirrors the check constraints on public.services (0001_initial_schema.sql).
// price/duration arrive from TextInput as strings — coerced here.
export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'auth:validation.nameRequired').max(200),
  description: z
    .string()
    .trim()
    .max(1000, 'auth:validation.descriptionTooLong')
    .optional()
    .or(z.literal('')),
  price: z.coerce.number({ message: 'auth:validation.priceRequired' }).min(0, 'auth:validation.priceMin'),
  duration: z.coerce
    .number({ message: 'auth:validation.durationRequired' })
    .int('auth:validation.durationWhole')
    .min(0, 'auth:validation.durationMin'),
  categories: z
    .array(z.string().trim().min(1).max(100))
    .max(5, 'auth:validation.categoriesMax')
    .optional()
    .default([]),
  isActive: z.boolean(),
});

// price/duration are z.coerce.number — the form's *input* values are still
// strings/unknown, the *output* (post-resolve) values are numbers. useForm
// needs both: <ServiceFormInput, ctx, ServiceForm>.
export type ServiceFormInput = z.input<typeof serviceSchema>;
export type ServiceForm = z.output<typeof serviceSchema>;
