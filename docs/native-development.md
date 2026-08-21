# Native development — Dev Client, EAS builds, iOS + Android

This app follows the **business app's native workflow verbatim** — one Expo
project for both platforms, a custom Dev Client instead of Expo Go, EAS build
profiles, account-level Apple credentials. The canonical guide is:

→ **`../../app/docs/native-development.md`**

Read it before any `eas build`, native-module add, `app.json` native change, or
iOS work. Everything there applies here with this app's identity swapped in
(`com.theluxmirror.booking`, scheme `luxbooking`, EAS project
`4d955f77-7f89-4d8c-a769-8fa23c7e96d9`; see `../BUILD_ANDROID.md` /
`../BUILD_IOS.md`).

Differences worth knowing:

- This repo has **Jest** (`npm test`, `jest-expo`, `__tests__/`); the business
  app does not.
- No `supabase/functions/` here, so `npx tsc --noEmit` is a fully clean run.
- Native modules in use: Stripe Payment Sheet (`@stripe/stripe-react-native`),
  push (`expo-notifications`), Sentry, Google sign-in via PKCE web redirect
  (no native module). No BLE — that is business-app only.

*(Until 2026-08-21 this file was a byte-identical copy of the business-app
doc, including references to planning notes that only exist in `../app/prompts/`;
replaced with this pointer.)*
