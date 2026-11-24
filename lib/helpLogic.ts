// Pure half of the in-app help center: turns the website's help feed
// (theluxmirror.com/api/help/<lang>, built from the same content as
// support.theluxmirror.com) into what a phone shows. No React, no network,
// so it can be tested alone (customer-app/__tests__/helpLogic.test.ts). The
// business app keeps an identical copy in app/lib/helpLogic.ts.
//
// Parsing is forgiving: an unknown field is ignored, a malformed article is
// dropped, and only a feed with no usable article at all is refused — the
// site can add to the shape without breaking installed apps.

export type HelpApp = 'business' | 'booking';

export type HelpBlock = {
  h?: string;
  p?: string;
  steps?: string[];
  note?: string;
};

export type HelpArticle = {
  /** "section/slug" — the id the ticket form and the feedback vote use. */
  id: string;
  section: string;
  slug: string;
  apps: HelpApp[];
  title: string;
  summary: string;
  /** ISO date the article was last checked against the product. */
  lastReviewed: string;
  blocks: HelpBlock[];
  related: string[];
};

export type HelpSection = {
  id: string;
  title: string;
  blurb: string;
  articles: HelpArticle[];
};

export type HelpFeed = {
  lang: string;
  sections: HelpSection[];
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

function parseBlock(raw: unknown): HelpBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const block: HelpBlock = {};
  const h = str(r.h);
  const p = str(r.p);
  const note = str(r.note);
  const steps = strList(r.steps);
  if (h) block.h = h;
  if (p) block.p = p;
  if (note) block.note = note;
  if (steps.length) block.steps = steps;
  return Object.keys(block).length ? block : null;
}

function parseArticle(raw: unknown, sectionId: string): HelpArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const slug = str(r.slug);
  const title = str(r.title);
  if (!slug || !title) return null;
  const blocks = Array.isArray(r.blocks)
    ? r.blocks.map(parseBlock).filter((b): b is HelpBlock => b !== null)
    : [];
  if (!blocks.length) return null;
  const apps = strList(r.apps).filter((a): a is HelpApp => a === 'business' || a === 'booking');
  return {
    id: `${sectionId}/${slug}`,
    section: sectionId,
    slug,
    // Same default as the site: an untagged article is for salons.
    apps: apps.length ? apps : ['business'],
    title,
    summary: str(r.summary) ?? '',
    lastReviewed: str(r.lastReviewed) ?? '',
    blocks,
    related: strList(r.related),
  };
}

/** Reads the feed, or throws when it holds nothing a phone could show. */
export function parseHelpFeed(raw: unknown): HelpFeed {
  if (!raw || typeof raw !== 'object') throw new Error('help feed is not an object');
  const r = raw as Record<string, unknown>;
  const sections: HelpSection[] = (Array.isArray(r.sections) ? r.sections : [])
    .map((s): HelpSection | null => {
      if (!s || typeof s !== 'object') return null;
      const sr = s as Record<string, unknown>;
      const id = str(sr.id);
      if (!id) return null;
      const articles = (Array.isArray(sr.articles) ? sr.articles : [])
        .map((a) => parseArticle(a, id))
        .filter((a): a is HelpArticle => a !== null);
      return { id, title: str(sr.title) ?? id, blurb: str(sr.blurb) ?? '', articles };
    })
    .filter((s): s is HelpSection => s !== null && s.articles.length > 0);
  if (!sections.length) throw new Error('help feed has no articles');
  return { lang: str(r.lang) ?? 'en', sections };
}

/** The sections and articles for one app; sections left empty are dropped. */
export function sectionsForApp(feed: HelpFeed, app: HelpApp, onlySection?: string): HelpSection[] {
  return feed.sections
    .filter((s) => !onlySection || s.id === onlySection)
    .map((s) => ({ ...s, articles: s.articles.filter((a) => a.apps.includes(app)) }))
    .filter((s) => s.articles.length > 0);
}

export function findArticle(feed: HelpFeed, id: string): HelpArticle | null {
  for (const s of feed.sections) {
    const a = s.articles.find((x) => x.id === id);
    if (a) return a;
  }
  return null;
}

/** An article's related list, keeping only ones this app has. */
export function relatedForApp(feed: HelpFeed, article: HelpArticle, app: HelpApp): HelpArticle[] {
  return article.related
    .map((id) => findArticle(feed, id))
    .filter((a): a is HelpArticle => a !== null && a.apps.includes(app));
}

/** Matching the site's ticket form: a payments article opens a payments ticket. */
export function categoryForArticle(id: string | null | undefined): 'payments' | null {
  return id?.startsWith('payments/') ? 'payments' : null;
}

/** The same check the server applies to an article id (0208 SLUG_RE). */
export function isArticleId(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9/-]{0,119}$/.test(v);
}
