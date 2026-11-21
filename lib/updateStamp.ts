// Which over-the-air update this phone is actually running, for the version
// line in Settings. "update Nov 21, 3:31 PM" = a published update from that
// time; "build …" = the code that shipped inside the store build. Added
// 2026-11-21 after a test run where nobody could tell whether a phone had
// picked up a fix. A technical stamp, deliberately not translated.

import * as Updates from 'expo-updates';

export function updateStamp(): string {
  try {
    const at = Updates.createdAt;
    if (!at) return '';
    const when = at.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${Updates.isEmbeddedLaunch ? 'build' : 'update'} ${when}`;
  } catch {
    return '';
  }
}
