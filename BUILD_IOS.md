# Building LUX Booking for iOS

Same native workflow as the business app — same Apple team, distribution
certificate, and APNs key (all account-level), same Dev-Client approach. Read
the shared guide:

→ **`../app/BUILD_IOS.md`** (and `../app/docs/native-development.md`).

Substitute this app's identity wherever the guide names the business app:

| | LUX Booking (this repo) |
|---|---|
| Bundle identifier | `com.theluxmirror.booking` |
| Scheme | `luxbooking` |
| EAS project | `4d955f77-7f89-4d8c-a769-8fa23c7e96d9` |
| App Store profile | own profile; cert + APNs key shared with the business app |

Cloud builds (`npx eas-cli build -p ios --profile production`) run from any
machine; the Mac mini is only needed for Simulator / Xcode debugging. The full
build → App Store Connect → TestFlight procedure is the workspace runbook
`../prompts/IOS_BUILD_AND_SUBMIT_RUNBOOK.md` (machine-local).

*(Until 2026-08-21 this file was a byte-identical copy of the business-app
guide with the wrong app name in the title; replaced with this pointer.)*
