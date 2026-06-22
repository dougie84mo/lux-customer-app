# Native development — Dev Client, EAS builds, iOS + Android

**Written:** 2026-06-05
**Purpose:** How LUX Mirror does native development now that it's off Expo Go.
Read this before any `eas build`, native-module add, `app.json` native change, or
iOS work.

> This doc is **committed** (travels with the repo, so any machine / new chat has
> it). The per-developer planning notes it references — `phase-h.md` (cutover
> plan) and `auth-email-and-password-reset.md` (auth/email) — live in the
> gitignored `prompts/` folder and do **not** travel; a fresh chat on another
> machine works from this doc + the git history.

---

## The one rule: ONE project for both platforms

There is **one repo, one `app.json`, one `eas.json`, one EAS project** —
`@jdfan/luxmirror-app`. iOS and Android build from the *same* codebase. The only
thing that changes is `--platform`. **Never create a separate `*-ios` project or
repo.**

```bash
eas build --profile development --platform android
eas build --profile development --platform ios
eas build --profile development --platform all
```

- `app.json` carries platform-specific keys (`ios.bundleIdentifier`,
  `android.package` — both `com.theluxmirror.app`; same string is fine, separate
  stores).
- Code is ~99% shared; branch with `Platform.OS` or `.ios.tsx` / `.android.tsx`
  when needed (see `lib/supabase.ts`).
- EAS stores credentials **per platform** under the one project (Android
  keystore + FCM key; iOS cert + provisioning + APNs key).
- **The Mac mini is just a Mac environment** (iOS Simulator, Xcode) that clones
  the *same* GitHub repo. It is NOT a separate project. Develop Android from
  Windows, iOS from the Mac mini, sync via `git push`/`pull`.

---

## Current state (2026-06-05)

- **Expo account:** `jdfan` (dougiefresh1513@gmail.com)
- **EAS project:** `@jdfan/luxmirror-app`, projectId
  `af5b1e0f-5bdb-44ec-908e-4d51169df7f0` (in `app.json` → `extra.eas.projectId`)
- **Identifier (both platforms):** `com.theluxmirror.app`
- **Android dev client:** ✅ built, installed on a physical phone, sign-in works,
  **push works** (FCM configured). This is the live Expo Go → Dev Client cutover.
- **iOS:** not started — next, on the Mac mini.
- **Installed for native:** `expo-dev-client` (replaces Expo Go), `expo-updates`
  (EAS Update / OTA, channel `development`, runtimeVersion appVersion),
  `expo-crypto` + `aes-js` (LargeSecureStore), `@sentry/react-native` (crash
  reporting), `react-native-ble-plx` + `tweetnacl`/`tweetnacl-sealedbox-js` (BLE
  pairing — see NEXT STEPS §2), `expo-document-picker` + `expo-file-system` +
  `base64-arraybuffer` (look-asset GLB uploads, added 2026-06-13). Added in code
  on Windows — they take effect at the **next per-platform rebuild** (new native
  modules).
- **FCM (Android push):** `google-services.json` committed at repo root +
  `app.json android.googleServicesFile`; **FCM V1 service-account key uploaded to
  EAS** via `eas credentials` (lives at Expo, NOT in the repo — it's the secret).

---

## Rebuild vs. reload (so you don't over-build)

- **JS/TS change → NO rebuild.** Screens, `lib/` logic, styles, schemas — Metro +
  Fast Refresh load them live (`npx expo start --dev-client`). Prod JS-only
  changes ship over-the-air with `eas update` (no rebuild, no store review).
- **Native change → rebuild.** New native module (BLE, Sentry, crypto), any
  `app.json` native config (`plugins`, permissions, `package`/`bundleIdentifier`,
  `scheme`, `associatedDomains`, `googleServicesFile`, splash/icon), SDK/RN
  upgrade, runtimeVersion change.
- **Batch native changes** → one rebuild per platform instead of several.

---

## Command cheat-sheet

```bash
# dev loop (phone connects to Metro; same Wi-Fi)
npx expo start --dev-client

# builds
eas build --profile development --platform android   # dev client APK
eas build --profile development --platform ios        # dev client (Mac not required to build; EAS cloud)
eas build --profile production  --platform all        # store builds

# accounts / devices / credentials
eas login            # jdfan
eas whoami
eas device:create    # register a physical iPhone UDID for iOS dev builds
eas credentials      # manage keystore / FCM / APNs / certs (per platform)

# OTA JS update to an existing build's runtimeVersion
eas update --branch development
```

---

## NEXT STEPS (for a new chat to continue)

### 0. Sync first
- [ ] `git push origin main`, and on the other machine `git pull`, before iOS.

### 1. iOS bring-up (Mac mini)
Prereqs: **Apple Developer Program** ($99/yr) on the owning Apple ID; a physical
**iPhone**. No Firebase/`google-services.json` needed — iOS push uses **APNs**,
which **EAS auto-generates/manages** during the build.
- [ ] On Mac mini: `git clone` the repo, `npm install`, `eas login`.
- [ ] `eas device:create` → register the iPhone UDID (open the QR/link on device).
- [ ] `eas build --profile development --platform ios` → approve Apple login;
      EAS handles cert/provisioning/APNs in the cloud.
- [ ] Install on iPhone → `npx expo start --dev-client` → verify sign-in + push
      (a row in `user_push_tokens` with platform `ios`).

### 2. Native-feature batch (config all, then ONE rebuild per platform)
- [x] **LargeSecureStore** — DONE in code (2026-06-06, `lib/supabase.ts`). AES-256
      key in SecureStore + ciphertext in AsyncStorage; uses `expo-crypto` +
      `aes-js`. Web stays plain AsyncStorage. Takes effect at next rebuild.
      *One-time cost:* existing sessions stored under the old plain-SecureStore
      adapter won't decrypt, so users sign in once more after the rebuild.
- [~] **BLE pairing** — phone side BUILT in code (2026-06-06), but **BLOCKED on
      firmware + untestable** until a mirror advertises. What landed:
      `react-native-ble-plx` + `tweetnacl`/`tweetnacl-sealedbox-js` installed,
      BLE plugin/permissions in `app.json`, and `lib/ble/` (contract, sealed-box
      crypto, scan→connect→read→seal→write→notify client) + `lib/blePairing.ts`
      hook + `app/(app)/devices-pair-ble.tsx` screen (entry from the QR pair
      screen). Scope is **Phase B = Wi-Fi handover only**; account binding stays
      on `claim_device` (so no token-mint backend needed yet).
      **Service UUID FROZEN (2026-06-13):** firmware froze `kServiceUuid` to
      `4c555800-…` (decision #2 / sub-phase B.3, 2026-06-08); verified the whole
      `lib/ble/contract.ts` wire contract matches `luxmirror/native/src/ble/
      uuids.hpp` byte-for-byte. No longer a blocker.
      **Remaining blockers, in order:** (1) firmware GATT server doesn't exist —
      only `uuids.hpp`/`types.hpp` headers (Phase B.1); see the firmware
      execution brief `luxmirror/prompts/native-app-phase-b-execution.md`.
      (2) Needs a physical phone + a mirror broadcasting to test (no emulator BLE).
- [~] **Look-asset uploads** — DONE in code (2026-06-13). Managers upload product
      GLB models in `app/(app)/look-assets.tsx`; `expo-document-picker` +
      `expo-file-system` + `base64-arraybuffer` read the file and push it to the
      `look-assets` Storage bucket. **No `app.json` config needed** — both modules
      autolink; they take effect at the **next rebuild** (new native modules).
      Server side: the `process-look-asset` Edge Function validates + budgets the
      GLB and flips the row to ready. **To activate:** rebuild + `eas`-deploy the
      function + run `supabase/storage_setup/look-assets.sql` once in Studio (the
      bucket doesn't exist yet). See the looks-asset-system notes in `prompts/`.
- [x] **Sentry** — DONE in code (2026-06-06). `@sentry/react-native` installed,
      Expo config plugin added to `app.json`, `Sentry.init` + `Sentry.wrap` in
      `app/_layout.tsx`, gated on `EXPO_PUBLIC_SENTRY_DSN` (no-op until set).
      **To light it up:** create a Sentry project → put its DSN in `.env` (and
      EAS env) → for source maps, set `SENTRY_ORG` / `SENTRY_PROJECT` /
      `SENTRY_AUTH_TOKEN` in the EAS build env. Then rebuild.
- [ ] **Deep linking / Universal Links** — `app.json` `scheme` (have `app`) + iOS
      `associatedDomains` (`applinks:` + `webcredentials:theluxmirror.com`); host
      `apple-app-site-association` + `assetlinks.json` on theluxmirror.com (in
      `web/marketing`, outside this repo). Unlocks magic-link password reset,
      password-manager association, and deep links — one domain setup, three wins.

### 3. Verify & polish
- [ ] Send a **test push** end-to-end (Expo push tool or a `notify-*` function).
- [ ] Production track: Stripe live mode, legal copy, store assets, submission
      (see `phase-h.md` Stage 5 — local).

---

## Known issues / gotchas

- **SecureStore >2048 warning** — FIXED in code via LargeSecureStore
  (`lib/supabase.ts`, 2026-06-06); clears at the next rebuild.
- **FCM is Android-only.** Don't add `google-services.json` for iOS.
- **`app.json android.permissions` has duplicate entries** — harmless (dedupe at
  build); clean up opportunistically.
- **EAS Build only includes git-tracked files** — anything a build needs
  (`google-services.json`) must be committed; secrets (FCM V1 key, APNs inputs)
  go to EAS via `eas credentials`, never the repo.
