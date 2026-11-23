import { overallState, parseStatusFeed } from '@/lib/statusLogic';

// Shape of Upptime's history/summary.json, trimmed to the fields we read.
const site = (slug: string, status: string, name = slug) => ({ slug, name, status, uptime: '100.00%' });

describe('parseStatusFeed', () => {
  it('orders the known checks and gives them translation keys', () => {
    const rows = parseStatusFeed([
      site('help-center', 'up'),
      site('payments-provider-stripe', 'up'),
      site('cloud-sign-in', 'up'),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['signIn', 'payments', 'helpCenter']);
  });

  it('hides the staff console', () => {
    const rows = parseStatusFeed([site('staff-console', 'down'), site('cloud-functions', 'up')]);
    expect(rows.map((r) => r.slug)).toEqual(['cloud-functions']);
  });

  it('keeps a check it has no wording for, under the status page name, last', () => {
    const rows = parseStatusFeed([site('text-messages', 'up', 'Text messages'), site('cloud-sign-in', 'up')]);
    expect(rows[1]).toEqual({ slug: 'text-messages', key: null, name: 'Text messages', state: 'up' });
  });

  it('reads an unknown status as down, never as up', () => {
    expect(parseStatusFeed([site('cloud-sign-in', 'maintenance')])[0].state).toBe('down');
  });

  it('refuses a file that is not a list of services', () => {
    expect(() => parseStatusFeed({ message: 'Not Found' })).toThrow();
    expect(() => parseStatusFeed([])).toThrow();
    expect(() => parseStatusFeed([site('staff-console', 'up')])).toThrow();
  });
});

describe('overallState', () => {
  const rows = (...states: string[]) => parseStatusFeed(states.map((s, i) => site(`check-${i}`, s)));

  it('is operational only when every service is up', () => {
    expect(overallState(rows('up', 'up'))).toBe('operational');
  });

  it('is degraded when something is slow and nothing is down', () => {
    expect(overallState(rows('up', 'degraded'))).toBe('degraded');
  });

  it('is an outage as soon as one service is down', () => {
    expect(overallState(rows('degraded', 'down', 'up'))).toBe('outage');
  });
});
