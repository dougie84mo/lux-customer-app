// Where help lives outside the app. The help center is the marketing repo's
// /support hub on its own host; the status page is Upptime on GitHub Pages.
// Same module as the business app's constants/support.ts — keep them in step.

export const SUPPORT_URL = 'https://support.theluxmirror.com';
export const STATUS_URL = 'https://status.theluxmirror.com';

/** Help page for one mirror: `/d/<support code>` (the six digits on the
 *  mirror's help screen). Without a code it is the hub's front page. */
export function deviceHelpUrl(supportCode: string | null | undefined): string {
  const code = supportCode?.replace(/\s/g, '');
  return code ? `${SUPPORT_URL}/d/${encodeURIComponent(code)}` : SUPPORT_URL;
}
