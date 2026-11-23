// Pure half of the in-app System status screen: turns the status page's own
// summary file into the short list a phone shows. No React, no network, so it
// is covered by __tests__/statusLogic.test.ts.
//
// The feed is Upptime's history/summary.json — the same file
// status.theluxmirror.com is drawn from — so the app and the web page cannot
// disagree.

export type ServiceState = 'up' | 'degraded' | 'down';
export type OverallState = 'operational' | 'degraded' | 'outage';

/** Translation key under account:support.systemStatus.service. */
export type ServiceKey =
  | 'signIn'
  | 'cloud'
  | 'payments'
  | 'website'
  | 'helpCenter'
  | 'cloudProvider';

export type StatusService = {
  slug: string;
  /** Set for the checks we have our own wording for. */
  key: ServiceKey | null;
  /** The status page's own name, shown when `key` is null. */
  name: string;
  state: ServiceState;
};

// Display order, most important to a person holding the app first. A check
// added to the status page later still appears, after these, under its own name.
const KNOWN: readonly (readonly [slug: string, key: ServiceKey])[] = [
  ['cloud-sign-in', 'signIn'],
  ['cloud-functions', 'cloud'],
  ['payments-provider-stripe', 'payments'],
  ['theluxmirror-com', 'website'],
  ['help-center', 'helpCenter'],
  ['cloud-provider-supabase', 'cloudProvider'],
];

// LUX's internal staff console: on the public page, of no use in the apps.
const HIDDEN = new Set(['staff-console']);

const toState = (raw: unknown): ServiceState =>
  raw === 'up' ? 'up' : raw === 'degraded' ? 'degraded' : 'down';

/** Throws when the file is not the list we expect, so the screen can say
 *  "couldn't load" instead of showing an empty, falsely calm page. */
export function parseStatusFeed(raw: unknown): StatusService[] {
  if (!Array.isArray(raw)) throw new Error('status feed is not a list');
  const rows: StatusService[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { slug, name, status } = item as Record<string, unknown>;
    if (typeof slug !== 'string' || !slug || HIDDEN.has(slug)) continue;
    const known = KNOWN.find(([s]) => s === slug);
    rows.push({
      slug,
      key: known ? known[1] : null,
      name: typeof name === 'string' && name ? name : slug,
      state: toState(status),
    });
  }
  if (rows.length === 0) throw new Error('status feed has no services');
  const rank = (slug: string) => {
    const i = KNOWN.findIndex(([s]) => s === slug);
    return i < 0 ? KNOWN.length : i;
  };
  // Array.prototype.sort is stable: unknown checks keep the feed's order.
  return rows.sort((a, b) => rank(a.slug) - rank(b.slug));
}

export function overallState(services: readonly StatusService[]): OverallState {
  if (services.some((s) => s.state === 'down')) return 'outage';
  if (services.some((s) => s.state === 'degraded')) return 'degraded';
  return 'operational';
}
