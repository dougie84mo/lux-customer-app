# Building LUX Booking for Android

This app uses **exactly the same native workflow as the business app** — same
EAS account, same Dev-Client approach, same Firebase conventions. Rather than
carry a second copy of the guide that drifts, read the shared one:

→ **`../app/BUILD_ANDROID.md`** (and `../app/docs/native-development.md` for the
one-project-two-platforms rule and EAS profiles).

Substitute this app's identity wherever the guide names the business app:

| | LUX Booking (this repo) |
|---|---|
| Package | `com.theluxmirror.booking` |
| Scheme | `luxbooking` |
| EAS project | `4d955f77-7f89-4d8c-a769-8fa23c7e96d9` |
| Firebase | own `google-services.json` (committed) |

Quick path: `npx eas-cli build --profile development --platform android`
from this directory, install the APK, `npm start`.

*(Until 2026-08-21 this file was a byte-identical copy of the business-app
guide with the wrong app name in the title; replaced with this pointer.)*
