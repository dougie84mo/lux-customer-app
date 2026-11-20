// Before/after pairs in a list of client photos (0254: client_photos.stage +
// pair_id). Pure, so it is tested (__tests__/photoPairs.test.ts).
//
// A pair is shown only when its pair_id holds exactly one 'before' and one
// 'after' photo in the list; anything else (a lone half, a half the client
// deleted, a mismatched tag) shows as ordinary single photos. Items keep the
// order of the input (newest first from useMyPhotos): a pair sits where its
// first member appeared.

export type PairablePhoto = {
  id: string;
  stage?: 'before' | 'after' | null;
  pair_id?: string | null;
};

export type PhotoItem<T extends PairablePhoto> =
  | { kind: 'single'; key: string; photo: T }
  | { kind: 'pair'; key: string; before: T; after: T };

export function groupPhotoPairs<T extends PairablePhoto>(photos: readonly T[]): PhotoItem<T>[] {
  const byPair = new Map<string, T[]>();
  for (const p of photos) {
    if (!p.pair_id) continue;
    const list = byPair.get(p.pair_id) ?? [];
    list.push(p);
    byPair.set(p.pair_id, list);
  }

  const complete = new Map<string, { before: T; after: T }>();
  for (const [pairId, members] of byPair) {
    if (members.length !== 2) continue;
    const before = members.find((m) => m.stage === 'before');
    const after = members.find((m) => m.stage === 'after');
    if (before && after) complete.set(pairId, { before, after });
  }

  const items: PhotoItem<T>[] = [];
  const emitted = new Set<string>();
  for (const p of photos) {
    const pair = p.pair_id ? complete.get(p.pair_id) : undefined;
    if (pair && p.pair_id) {
      if (emitted.has(p.pair_id)) continue;
      emitted.add(p.pair_id);
      items.push({ kind: 'pair', key: `pair:${p.pair_id}`, before: pair.before, after: pair.after });
    } else {
      items.push({ kind: 'single', key: p.id, photo: p });
    }
  }
  return items;
}
