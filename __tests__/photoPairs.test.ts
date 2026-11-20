import { groupPhotoPairs } from '../lib/photoPairs';
import {
  PORTFOLIO_CONSENT_EXPLANATION,
  PORTFOLIO_CONSENT_LABEL,
} from '../lib/portfolioConsent';
import enPhotos from '../locales/en/photos.json';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const photo = (id: string, stage: 'before' | 'after' | null = null, pair_id: string | null = null) => ({
  id,
  stage,
  pair_id,
});

describe('groupPhotoPairs', () => {
  it('keeps unpaired photos as singles in order', () => {
    const items = groupPhotoPairs([photo('a'), photo('b', 'after')]);
    expect(items.map((i) => i.kind)).toEqual(['single', 'single']);
    expect(items.map((i) => i.key)).toEqual(['a', 'b']);
  });

  it('joins a complete before/after pair at the position of its first member', () => {
    const items = groupPhotoPairs([
      photo('x'),
      photo('after1', 'after', 'p1'),
      photo('y'),
      photo('before1', 'before', 'p1'),
    ]);
    expect(items.map((i) => i.key)).toEqual(['x', 'pair:p1', 'y']);
    const pair = items[1];
    expect(pair.kind).toBe('pair');
    if (pair.kind === 'pair') {
      expect(pair.before.id).toBe('before1');
      expect(pair.after.id).toBe('after1');
    }
  });

  it('shows a lone half as a single photo', () => {
    const items = groupPhotoPairs([photo('after1', 'after', 'p1'), photo('z')]);
    expect(items.map((i) => i.kind)).toEqual(['single', 'single']);
  });

  it('does not pair two photos with the same stage', () => {
    const items = groupPhotoPairs([photo('a', 'after', 'p1'), photo('b', 'after', 'p1')]);
    expect(items.every((i) => i.kind === 'single')).toBe(true);
  });

  it('handles several pairs', () => {
    const items = groupPhotoPairs([
      photo('a2', 'after', 'p2'),
      photo('a1', 'after', 'p1'),
      photo('b2', 'before', 'p2'),
      photo('b1', 'before', 'p1'),
    ]);
    expect(items.map((i) => i.key)).toEqual(['pair:p2', 'pair:p1']);
  });
});

describe('portfolio consent wording', () => {
  it('matches the English locale word for word (it is the recorded wording)', () => {
    expect(enPhotos.portfolioConsent.label).toBe(PORTFOLIO_CONSENT_LABEL);
    expect(enPhotos.portfolioConsent.explanation).toBe(PORTFOLIO_CONSENT_EXPLANATION);
  });
});
