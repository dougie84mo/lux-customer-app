# Building the LUX Mirror app for Android

How to build and run the phone app on Android — as a **development
build** (a.k.a. dev client), which is what unlocks native modules that
Expo Go can't load (Bluetooth, etc.).

> **Android builds run on Windows or macOS** (unlike iOS, which needs a
> Mac). The steps below note both where they differ.

---

## Expo Go vs. development build — which do you need?

- **Expo Go** (today's default): scan a QR, app loads. Works for
  everything currently in the app, *including* `expo-contacts`. No build
  needed. Run `npx expo start` and use the Expo Go app.
- **Development build**: a copy of the app you compile yourself. Needed
  the moment the app uses a native module Expo Go doesn't bundle —
  e.g. `react-native-ble-plx` for Bluetooth. Build once, install on the
  device, then the daily loop is the same as Expo Go.

Rule of thumb: stay on Expo Go until a Bluetooth/native-only feature
forces the switch. This doc is for that switch.

---

## Prerequisites (one-time)

| Tool | How | Notes |
|------|-----|-------|
| **Node.js 20 LTS+** | nodejs.org or `nvm` | Match the version used elsewhere on the team. |
| **Android Studio** | developer.android.com/studio | Bundles the Android SDK, platform-tools (`adb`), and a JDK. |
| **Android SDK Platform + Build-Tools** | Android Studio → SDK Manager | Install the latest stable API level + Build-Tools. |
| **An emulator (AVD)** | Android Studio → Device Manager | For everyday dev. **No Bluetooth** — see Testing notes. |
| **A physical Android phone** | — | Required to test **Bluetooth**. No developer account needed for Android. |

### Environment variables

`adb` and the SDK must be discoverable. Android Studio sets most of this
up; verify `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) points at the SDK:

- **macOS**: `~/Library/Android/sdk` — add to `~/.zshrc`:
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```
- **Windows**: `%LOCALAPPDATA%\Android\Sdk` — set via:
  ```powershell
  setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
  # add %ANDROID_HOME%\platform-tools to your PATH
  ```

Verify: `adb --version` should print without error.

---

## One-time project setup

```bash
# 1. Clone the repo (GitHub: luxmirror-app)
git clone git@github.com:dougie84mo/luxmirror-app.git
cd luxmirror-app          # the Expo project is the repo root

# 2. Install JS dependencies
npm install

# 3. Create the .env file (never committed — see .gitignore)
#    Ask a teammate or copy from .env.example if present.
```

`.env` must contain:

```env
EXPO_PUBLIC_SUPABASE_URL=https://ywmeghkhswixaueptfrt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Android package name.** A build needs a unique application ID. Set it
once in `app.json` under `expo.android`:

```json
"android": {
  "package": "com.theluxmirror.app"
}
```

If it's missing, the first `npx expo run:android` will prompt for one.

---

## Build & run the development build

The `android/` and `ios/` folders are generated (and git-ignored) — Expo
regenerates them via prebuild. Don't commit them.

**On an emulator** (start an AVD from Android Studio's Device Manager
first, or it'll launch one):

```bash
npx expo run:android
```

**On a physical phone** (needed for Bluetooth):

1. On the phone: enable **Developer options** (tap *Build number* 7×
   in Settings → About), then turn on **USB debugging**.
2. Plug it in via USB; accept the "Allow USB debugging" prompt.
3. Confirm it's seen: `adb devices` should list it.
4. Build:
   ```bash
   npx expo run:android
   ```

The first build takes several minutes (Gradle). When it finishes, the
dev build is installed and Metro is running.

---

## Daily development loop

After the dev build is installed, you don't rebuild for normal work:

```bash
npx expo start          # starts Metro
```

Open the **LUX Mirror dev build** app on the device (not Expo Go). It
connects to Metro; edits hot-reload instantly — same feel as Expo Go.

---

## When you MUST rebuild (`npx expo run:android` again)

Only when **native code** changes:

- Adding/removing/upgrading a native module (e.g. `react-native-ble-plx`).
- Changing native config in `app.json` (permissions, plugins, package).
- Bumping the Expo SDK.

Pure JS/TS/React changes **never** need a rebuild — just hot-reload.

---

## Native modules & permissions in this project

Config plugins live in `app.json` → `expo.plugins`. Android permissions
are generated into the manifest from those plugins:

- **`expo-camera`** — QR pairing.
- **`expo-contacts`** — client import. Note: `expo-contacts` *also*
  works in Expo Go, so contacts can be tested without a dev build.
- **`react-native-ble-plx`** — *planned*, not yet installed. Bluetooth.
  Will need `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT` (Android 12+) and,
  on older Android, location permission. Requires this dev build + a
  physical phone.

---

## Testing notes

- **Emulator**: fine for UI, navigation, Supabase work. **No Bluetooth**
  (emulators have no BLE radio). Camera/QR is limited.
- **Physical phone**: required for Bluetooth and reliable camera/QR.
  This is the real test rig once BLE lands.
- BLE pairing also needs a **real mirror** to talk to.

---

## EAS Build — cloud alternative

If you'd rather not install the local Android toolchain:

```bash
npm i -g eas-cli
eas login
eas build:configure          # generates eas.json
eas build --profile development --platform android
```

EAS builds in the cloud (~10–20 min) and produces an installable APK —
download it and `adb install` it, or open the link on the phone. Local
`expo run:android` is faster day-to-day; EAS is good for shareable
builds and CI.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `adb` not found | Add `platform-tools` to PATH; verify `ANDROID_HOME`. |
| `SDK location not found` | Ensure `ANDROID_HOME`/`ANDROID_SDK_ROOT` is set; restart the shell. |
| Device not listed by `adb devices` | Re-plug USB; accept the debugging prompt on the phone; try a different cable. |
| Stale bundler / red screen | `npx expo start --clear` |
| Gradle build fails after a dep change | Delete `android/`, rerun `npx expo run:android` (it regenerates). |
| `JAVA_HOME` / JDK errors | Use the JDK bundled with Android Studio; set `JAVA_HOME` to it. |
| QR says "no usable data" / "development build" | That QR is for a dev build. For Expo Go use `npx expo start` with no `expo-dev-client` installed; for the dev build, open the installed dev build app, not Expo Go. |

---

## See also

- `BUILD_IOS.md` — the iOS equivalent of this doc.
- `CLAUDE.md` — project architecture, stack, conventions.
