import { z } from 'zod';

// ----- Auth -----
// Single schema covers both sign-in and sign-up. `name` is optional at the
// schema level; the login screen enforces it for sign-up via UI validation.
export const authSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
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
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

// ----- Password reset (OTP, signed-out) -----
// Two-step: request a code by email, then confirm with the code + new password.
// OTP-based so it works in Expo Go without deep linking (a magic link would
// need Associated Domains / a custom scheme — a Dev Client / Phase H concern).
export const resetRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});
export type ResetRequestForm = z.infer<typeof resetRequestSchema>;

export const resetConfirmSchema = z
  .object({
    // Length is the Supabase "Email OTP length" setting (6–10 digits); accept
    // the configured length rather than pinning to one value.
    token: z.string().trim().regex(/^\d{6,10}$/, 'Enter the code from your email'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetConfirmForm = z.infer<typeof resetConfirmSchema>;

// ----- Onboarding -----
export const businessTypeSchema = z.enum(['BARBER', 'SALON', 'SPA']);
export type BusinessType = z.infer<typeof businessTypeSchema>;

export const onboardingSchema = z.object({
  // Business
  businessName: z.string().min(1, 'Business name is required').max(200),
  businessType: businessTypeSchema,
  logoUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  // Location
  locationName: z.string().min(1, 'Location name is required').max(200),
  locationStreet: z.string().min(1, 'Street is required').max(200),
  locationCity: z.string().min(1, 'City is required').max(100),
  locationState: z.string().length(2, 'Two-letter state code'),
  locationZip: z.string().min(5, 'ZIP is required').max(10),
  locationPhone: z.string().min(10, 'Phone is required').max(20),
  timezone: z.string().min(1, 'Timezone is required'),
});

export type OnboardingForm = z.infer<typeof onboardingSchema>;

// ----- Customer -----
// Mirrors the check constraints on public.customers (0001_initial_schema.sql).
// Optional text fields accept '' from the UI and are normalized to null
// before insert/update.
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(20, 'Phone is too long').optional().or(z.literal('')),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes are too long')
    .optional()
    .or(z.literal('')),
});

export type CustomerForm = z.infer<typeof customerSchema>;

// ----- Service -----
// Mirrors the check constraints on public.services (0001_initial_schema.sql).
// price/duration arrive from TextInput as strings — coerced here.
export const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z
    .string()
    .trim()
    .max(1000, 'Description is too long')
    .optional()
    .or(z.literal('')),
  price: z.coerce.number({ message: 'Enter a price' }).min(0, 'Price must be 0 or more'),
  duration: z.coerce
    .number({ message: 'Enter a duration' })
    .int('Whole minutes only')
    .min(0, 'Duration must be 0 or more'),
  categories: z
    .array(z.string().trim().min(1).max(100))
    .max(5, 'Up to 5 categories')
    .optional()
    .default([]),
  isActive: z.boolean(),
});

// price/duration are z.coerce.number — the form's *input* values are still
// strings/unknown, the *output* (post-resolve) values are numbers. useForm
// needs both: <ServiceFormInput, ctx, ServiceForm>.
export type ServiceFormInput = z.input<typeof serviceSchema>;
export type ServiceForm = z.output<typeof serviceSchema>;
