import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// Saved businesses (migration 0055). A favorite is just (user_id, business_id);
// my_favorite_businesses() returns the public business summary, newest first.
export type FavoriteBusiness = {
  id: string;
  name: string;
  type: string;
  logo_url: string | null;
  description: string | null;
  favorited_at: string;
};

// The minimal business fields needed to optimistically add a favorite before the
// server round-trip — supplied by whichever surface holds the heart.
export type FavoriteSeed = Pick<FavoriteBusiness, 'id' | 'name' | 'type' | 'logo_url' | 'description'>;

const FAVORITES_KEY = ['my-favorites'];

export function useMyFavorites() {
  return useQuery({
    queryKey: FAVORITES_KEY,
    queryFn: async (): Promise<FavoriteBusiness[]> => {
      const { data, error } = await supabase.rpc('my_favorite_businesses');
      if (error) throw error;
      return (data ?? []) as FavoriteBusiness[];
    },
  });
}

// Whether a business is favorited. Reads the shared favorites cache so every
// heart stays in sync without an extra query per screen (React Query dedupes the
// underlying my_favorite_businesses fetch by key).
export function useIsFavorite(businessId?: string) {
  const { data } = useMyFavorites();
  return !!businessId && !!data?.some((f) => f.id === businessId);
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ business, on }: { business: FavoriteSeed; on: boolean }) => {
      const { error } = await supabase.rpc('set_favorite', {
        p_business_id: business.id,
        p_on: on,
      });
      if (error) throw error;
    },
    // Optimistically reflect the toggle so the heart fills/empties instantly.
    onMutate: async ({ business, on }) => {
      await qc.cancelQueries({ queryKey: FAVORITES_KEY });
      const previous = qc.getQueryData<FavoriteBusiness[]>(FAVORITES_KEY);
      qc.setQueryData<FavoriteBusiness[]>(FAVORITES_KEY, (cur = []) => {
        if (on) {
          if (cur.some((f) => f.id === business.id)) return cur;
          return [{ ...business, favorited_at: new Date().toISOString() }, ...cur];
        }
        return cur.filter((f) => f.id !== business.id);
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(FAVORITES_KEY, ctx.previous);
    },
    // Reconcile with the server (real favorited_at / ordering) once settled.
    onSettled: () => qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });
}
