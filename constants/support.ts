// Where help lives outside the app. The help center is the marketing repo's
// /support hub on its own host; the status page is Upptime on GitHub Pages.
// Same module as the business app's constants/support.ts — keep them in step.

export const SUPPORT_URL = 'https://support.theluxmirror.com';
export const STATUS_URL = 'https://status.theluxmirror.com';

/** The file the status page itself is drawn from (Upptime writes it to the
 *  status repo after every check). The in-app System status screen reads it
 *  directly, so the app and the page always agree. */
export const STATUS_FEED_URL =
  'https://raw.githubusercontent.com/dougie84mo/luxmirror-status/master/history/summary.json';

/** Which app's articles the in-app help center shows (the feed tags each
 *  article "business" and/or "booking"). The one line that differs between
 *  the two apps' copies of this file. */
export const HELP_APP = 'booking' as const;

/** The help center as JSON, built from the same content as SUPPORT_URL
 *  (marketing src/app/api/help/[lang]/route.ts). */
export function helpFeedUrl(lang: string): string {
  return `https://theluxmirror.com/api/help/${encodeURIComponent(lang)}`;
}

/** Help page for one mirror: `/d/<support code>` (the six digits on the
 *  mirror's help screen). Without a code it is the hub's front page. */
export function deviceHelpUrl(supportCode: string | null | undefined): string {
  const code = supportCode?.replace(/\s/g, '');
  return code ? `${SUPPORT_URL}/d/${encodeURIComponent(code)}` : SUPPORT_URL;
}
