# LUX Booking — update trains

OTA-only releases to the installed store builds (channel `production`).
Publish with `node scripts/release-train.mjs update` from this repo: zero builds, zero EAS
workflow minutes. The newest `## ` heading becomes the update message.
Policy: `prompts/RELEASE_RUNBOOK.md` "Release trains" (machine-local).

## 2026-09-13 — runtime 1.0.4 (since build commit 8fcdd78)

- f44bb16 Settings is a sectioned hub like the business app; Mirror photos and Account & sign-in are their own screens.
- b2aaaee Text messages switch refreshes on focus and foreground and says when you replied STOP; the booking step stops re-offering texts after a STOP.

## 2026-09-30 — runtime 1.0.4 (since update train b5bce94)

- a772417 i18n setup: i18next, locale-aware formatters, language picker, users.locale sync.
- 9ebc4e2 The whole app in English + Spanish (conventions in docs/i18n.md).
- Not in this train: Spanish permission prompts (app.json locales) are a native change, queued for the next build train.
