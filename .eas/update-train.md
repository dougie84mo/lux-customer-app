# LUX Booking — update trains

OTA-only releases to the installed store builds (channel `production`).
Publish with `node scripts/release-train.mjs update` from this repo: zero builds, zero EAS
workflow minutes. The newest `## ` heading becomes the update message.
Policy: `prompts/RELEASE_RUNBOOK.md` "Release trains" (machine-local).

## 2026-09-13 — runtime 1.0.4 (since build commit 8fcdd78)

- f44bb16 Settings is a sectioned hub like the business app; Mirror photos and Account & sign-in are their own screens.
- b2aaaee Text messages switch refreshes on focus and foreground and says when you replied STOP; the booking step stops re-offering texts after a STOP.
