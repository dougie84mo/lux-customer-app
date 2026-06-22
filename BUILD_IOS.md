# Building the LUX Mirror app for iOS

How to build and run the phone app on iOS — as a **development build**
(a.k.a. dev client), which is what unlocks native modules that Expo Go
can't load (Bluetooth, etc.).

> **iOS builds require a Mac.** You cannot build an iOS app from Windows.
> All steps here run on the Mac mini. Code can still be edited on any
> machine — only the *build* must happen on the Mac.

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

## Prerequisites (one-time, on the Mac mini)

| Tool | How | Notes |
|------|-----|-------|
| **Xcode** | Mac App Store | ~15 GB. Open it once after install to accept the license. |
| **Xcode Command Line Tools** | `xcode-select --install` | Then point to Xcode: `sudo xcode-select -s /Applications/Xcode.app` |
| **Node.js 20 LTS+** | nodejs.org or `nvm` | Match the version used elsewhere on the team. |
| **Watchman** | `brew install watchman` | Recommended by Expo for file watching. |
| **CocoaPods** | usually handled by `expo run:ios` | If pod install fails: `sudo gem install cocoapods`. |
| **Apple Developer account** | developer.apple.com | Required for **physical iPhone** builds. Not needed for the Simulator. |
| **A physical iPhone** | — | Required to test **Bluetooth** — the Simulator has no BLE radio. |

---

## One-time project setup

```bash
# 1. Clone the repo onto the Mac (it lives on GitHub as luxmirror-app)
git clone git@github.com:dougie84mo/luxmirror-app.git
cd luxmirror-app          # the Expo project is the repo root on the Mac

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

**Bundle identifier.** A device build needs a unique iOS bundle ID. Set
it once in `app.json` under `expo.ios`:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.theluxmirror.app"
}
```

If it's missing, the first `npx expo run:ios` will prompt you for one.

**Signing.** With a paid Apple Developer account, let Xcode manage it:
1. Run the first build (below). Expo generates the `ios/` folder.
2. Open `ios/app.xcworkspace` in Xcode.
3. Select the app target → **Signing & Capabilities** → check
   **Automatically manage signing** → pick your **Team** (your Apple
   Developer account). Xcode registers the device and creates the
   provisioning profile.

---

## Build & run the development build

The `ios/` and `android/` folders are generated (and git-ignored) — Expo
regenerates them via prebuild. Don't commit them.

**On the iOS Simulator** (no Apple account needed, but no Bluetooth):

```bash
npx expo run:ios
```

**On a physical iPhone** (needed for Bluetooth):

```bash
# Plug the iPhone in via USB, unlock it, tap "Trust This Computer"
npx expo run:ios --device
# pick your iPhone from the list
```

The first build takes several minutes (Xcode compile + CocoaPods). When
it finishes, the dev build is installed on the device/Simulator and
Metro is running.

---

## Daily development loop

After the dev build is installed, you don't rebuild for normal work:

```bash
npx expo start          # starts Metro
```

Open the **LUX Mirror dev build** app on the device (not Expo Go). It
connects to Metro; edits hot-reload instantly — same feel as Expo Go.

---

## When you MUST rebuild (`npx expo run:ios` again)

Only when **native code** changes:

- Adding/removing/upgrading a native module (e.g. `react-native-ble-plx`).
- Changing native config in `app.json` (permissions, plugins, bundle ID).
- Bumping the Expo SDK.

Pure JS/TS/React changes **never** need a rebuild — just hot-reload.

---

## Native modules & permissions in this project

Config plugins live in `app.json` → `expo.plugins`. iOS permission
strings (the `Info.plist` prompts) are set there:

- **`expo-camera`** — QR pairing. `cameraPermission` string set.
- **`expo-contacts`** — client import. `contactsPermission` string set.
  Note: `expo-contacts` *also* works in Expo Go, so contacts can be
  tested without a dev build.
- **`react-native-ble-plx`** — *planned*, not yet installed. Bluetooth.
  Will need `NSBluetoothAlwaysUsageDescription`. Requires this dev
  build + a physical iPhone.

Config-plugin permission strings only take effect in a dev/production
build — Expo Go ships its own generic prompts.

---

## Testing notes

- **iOS Simulator**: fine for UI, navigation, Supabase, camera-less work.
  **No Bluetooth.** **No real camera** (QR scanning needs a device).
- **Physical iPhone**: required for Bluetooth and camera/QR. This is the
  real test rig once BLE lands.
- BLE pairing also needs a **real mirror** to talk to.

---

## EAS Build — cloud alternative

If you'd rather not build locally, Expo's cloud builder works too:

```bash
npm i -g eas-cli
eas login
eas build:configure          # generates eas.json
eas build --profile development --platform ios
```

EAS builds in the cloud (~10–20 min) and gives you an installable
build. Local `expo run:ios` is faster for day-to-day; EAS is good for
shareable builds and CI. Either way the Apple Developer account and
signing still apply.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `xcrun: error` / wrong Xcode path | `sudo xcode-select -s /Applications/Xcode.app` |
| `pod install` fails | `sudo gem install cocoapods`, then `cd ios && pod install` |
| Stale bundler / red screen | `npx expo start --clear` |
| Signing errors on device | Open `ios/app.xcworkspace` in Xcode, fix Team under Signing & Capabilities |
| "Untrusted Developer" on iPhone | iPhone → Settings → General → VPN & Device Management → trust your profile |
| Build cache weirdness | Delete `ios/`, rerun `npx expo run:ios` (it regenerates) |
| QR says "no usable data" / "development build" | That QR is for a dev build. For Expo Go use `npx expo start` with no `expo-dev-client` installed; for the dev build, open the installed dev build app, not Expo Go. |

---

## See also

- `BUILD_ANDROID.md` — the Android equivalent of this doc.
- `CLAUDE.md` — project architecture, stack, conventions.
