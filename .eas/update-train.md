# LUX Booking — update trains

OTA-only releases to the installed store builds (channel `production`).
Publish with `node scripts/release-train.mjs update` from this repo: zero builds, zero EAS
workflow minutes. The newest `## ` heading becomes the update message.
Policy: `prompts/RELEASE_RUNBOOK.md` "Release trains" (machine-local).

**Queued for the next build train — Spanish iOS permission prompts.** The text is
ready in `native-locales/es.json` (not yet wired, so the native fingerprint and OTA
trains are unaffected). On build day, add this to `app.json` under `"expo"`, then bump
the version and run the build train:

    "locales": { "es": "./native-locales/es.json" }

Afterwards, check with `npx expo config --type introspect` that `locales.es` resolves.
Android needs nothing: it shows its own system wording, already in the phone's language.

## 2026-09-13 — runtime 1.0.4 (since build commit 8fcdd78)

- f44bb16 Settings is a sectioned hub like the business app; Mirror photos and Account & sign-in are their own screens.
- b2aaaee Text messages switch refreshes on focus and foreground and says when you replied STOP; the booking step stops re-offering texts after a STOP.

## 2026-09-30 — runtime 1.0.4 (since update train b5bce94)

- a772417 i18n setup: i18next, locale-aware formatters, language picker, users.locale sync.
- 9ebc4e2 The whole app in English + Spanish (conventions in docs/i18n.md).
- Not in this train: Spanish permission prompts (app.json locales) are a native change, queued for the next build train.

## 2026-10-02 — runtime 1.0.4 (since update train 736d347)

- e8ac3e4 Standard service categories are translated (Spanish labels on Discover and the business page).

## 2026-10-30 — runtime 1.0.4 (since update train 5d6c305)

- 2e40024 One flat Account hub laid out like the business app's Settings.
- d50d9e7 Spanish iOS permission prompts land as `native-locales/es.json` only; `app.json` is untouched, so nothing native ships here. Still queued for the next build train (wire `locales.es` on build day, see the note above).

## 2026-11-05 — runtime 1.0.4 (since update train 4d41e1f)

- 2889533 Toggles redrawn (violet with a check when on, outlined grey when off), same component as the business app.

## 2026-11-10 — runtime 1.0.4 (since update train c39e333)

- 61ea912 Settings › Mirror photos: "Help improve LUX's hairstyle AI" (off by default, full consent text); a line on the booking screen when the salon takes part (cloud 0236).
- 5a8ccdf live-stream consent screens ride along hidden (LIVE_STREAMING_UI_ENABLED = false).

## 2026-11-22 — runtime 1.0.4 (since a0fe38b)

- b2f8053 Account › Help & Support: "System status" opens a screen inside the app (overall state, a live check from this phone, each service) instead of the browser. New row "My requests": the messages you sent to support and whether each is New, Answered or Resolved; "View my requests" on the sent confirmation (cloud 0267, applied).

## 2026-11-23 — runtime 1.0.4 (since 346f22f)

- f2a1b6e Walk in: when nobody can take a walk-in (no one on shift within the hour, or today is full) the screen says so right away with "Book an appointment instead", before the service step.

## 2026-11-23 (2) — runtime 1.0.4 (since update train a64703a)

- 052707a Help center inside the app: Account › Help & Support › "Help center" opens native screens (article list + article) for LUX Booking's articles, read from theluxmirror.com/api/help/<lang>, with an offline copy kept on the phone; "Contact support" from an article carries the article id.

## 2026-11-24 — runtime 1.0.4 (since update train 1b2f0f5)

- 4658465, eaaab50 (committed 11/23 night, not yet published): My requests opens a conversation with LUX Support replies and a reply box, with an unread badge; Contact support topic is a dropdown. Cloud 0268 applied.
- bb986e3 Support replies show who answered: a reply is labelled "<first name> (LUX Support)", and the push and the email use the same name. Settings › Notifications › App has a new "Support replies" switch for that push (on by default; the email copy is always sent). Cloud 0269 applied.

## 2026-11-26 — runtime 1.0.4 (since update train 75f4c4f)

- 8521be3 Account › Help & Support: "Help center" and "System status" open the website in the browser again. "Contact support" and "My requests" stay inside the app.
- 2d147cd Keyboard-safe form sheet kit added (no screen uses it yet; nothing visible).
