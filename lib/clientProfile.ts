import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// The signed-in user's own public.users row. Used by the client Account
// screen; readable under the existing "select own user row" RLS.
export type MyProfile = {
  id: string;
  name: string | null;
  email: string | null;
  avatar_path: string | null;
};

export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, avatar_path')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as MyProfile | null;
    },
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; name: string }) => {
      const { error } = await supabase
        .from('users')
        .update({ name: input.name.trim() })
        .eq('id', input.userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['my-profile', vars.userId] });
    },
  });
}
