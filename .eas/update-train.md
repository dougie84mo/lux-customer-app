# LUX Booking — update trains

OTA-only releases to the installed store builds (channel `production`).
A push that changes this file runs `.eas/workflows/update.yml`: zero builds.
Policy: `prompts/RELEASE_RUNBOOK.md` "Release trains" (machine-local).

## 2026-09-13 — runtime 1.0.4 (since build commit 8fcdd78)

- f44bb16 Settings is a sectioned hub like the business app; Mirror photos and Account & sign-in are their own screens.
- b2aaaee Text messages switch refreshes on focus and foreground and says when you replied STOP; the booking step stops re-offering texts after a STOP.
