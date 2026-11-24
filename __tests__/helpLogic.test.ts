import {
  categoryForArticle,
  findArticle,
  isArticleId,
  parseHelpFeed,
  relatedForApp,
  sectionsForApp,
} from '@/lib/helpLogic';

// Shape of theluxmirror.com/api/help/<lang>, trimmed to what the apps read.
const article = (slug: string, apps?: string[], extra: Record<string, unknown> = {}) => ({
  slug,
  title: `Title ${slug}`,
  summary: `Summary ${slug}`,
  lastReviewed: '2026-11-02',
  blocks: [{ p: 'Body' }],
  ...(apps ? { apps } : {}),
  ...extra,
});

const feed = () =>
  parseHelpFeed({
    version: 1,
    lang: 'en',
    sections: [
      {
        id: 'fix-it',
        title: 'Fix it',
        blurb: 'Symptom first.',
        articles: [
          article('offline', undefined, { related: ['fix-it/client-photos', 'fix-it/gone'] }),
          article('client-photos', ['business', 'booking'], { related: ['fix-it/offline'] }),
        ],
      },
      { id: 'payments', title: 'Payments', blurb: '', articles: [article('payouts', ['business'])] },
    ],
    releases: [],
  });

describe('parseHelpFeed', () => {
  it('builds "section/slug" ids and defaults untagged articles to business', () => {
    const f = feed();
    expect(f.sections[0].articles[0]).toMatchObject({ id: 'fix-it/offline', apps: ['business'] });
  });

  it('drops malformed articles and empty sections, keeps the rest', () => {
    const f = parseHelpFeed({
      sections: [
        { id: 'a', articles: [{ slug: 'no-title', blocks: [{ p: 'x' }] }, article('ok')] },
        { id: 'b', articles: [{ slug: 'x', title: 'No blocks', blocks: [] }] },
      ],
    });
    expect(f.sections.map((s) => s.id)).toEqual(['a']);
    expect(f.sections[0].articles.map((a) => a.slug)).toEqual(['ok']);
  });

  it('ignores unknown block fields and empty strings', () => {
    const f = parseHelpFeed({
      sections: [{ id: 'a', articles: [article('x', undefined, { blocks: [{ p: '', img: 'y' }, { steps: ['One', 2, ''] }] })] }],
    });
    expect(f.sections[0].articles[0].blocks).toEqual([{ steps: ['One'] }]);
  });

  it('refuses a feed with nothing to show', () => {
    expect(() => parseHelpFeed({ sections: [] })).toThrow();
    expect(() => parseHelpFeed('<html>')).toThrow();
    expect(() => parseHelpFeed(null)).toThrow();
  });
});

describe('sectionsForApp', () => {
  it('shows LUX Booking only its own articles, and drops sections left empty', () => {
    const s = sectionsForApp(feed(), 'booking');
    expect(s.map((x) => x.id)).toEqual(['fix-it']);
    expect(s[0].articles.map((a) => a.slug)).toEqual(['client-photos']);
  });

  it('narrows to one section when asked', () => {
    expect(sectionsForApp(feed(), 'business', 'payments').map((x) => x.id)).toEqual(['payments']);
  });
});

describe('relatedForApp', () => {
  it('skips related articles that are missing or meant for the other app', () => {
    const f = feed();
    const offline = findArticle(f, 'fix-it/offline')!;
    expect(relatedForApp(f, offline, 'business').map((a) => a.id)).toEqual(['fix-it/client-photos']);
    const photos = findArticle(f, 'fix-it/client-photos')!;
    expect(relatedForApp(f, photos, 'booking')).toEqual([]);
  });
});

describe('helpers', () => {
  it('opens a payments ticket from a payments article', () => {
    expect(categoryForArticle('payments/payouts')).toBe('payments');
    expect(categoryForArticle('fix-it/offline')).toBeNull();
    expect(categoryForArticle(undefined)).toBeNull();
  });

  it('accepts only ids the server accepts', () => {
    expect(isArticleId('fix-it/offline')).toBe(true);
    expect(isArticleId('Fix-It/Offline')).toBe(false);
    expect(isArticleId('../x')).toBe(false);
    expect(isArticleId(['fix-it/offline'])).toBe(false);
  });
});
