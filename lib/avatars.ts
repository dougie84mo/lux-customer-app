import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Person-level profile photos (team members + clients), migration 0043. Public
// bucket → served via the CDN url; writes are self-or-manager (set_user_avatar).
export const AVATARS_BUCKET = 'avatars';

// Public CDN url for a stored avatar path, or null when unset.
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // Pass through absolute URLs (e.g. seeded placeholder faces); otherwise treat
  // it as a key in the public avatars bucket and resolve to its CDN url.
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
}

// First-letter(s) fallback label for an Avatar.Text when there's no photo.
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Upload a picked image to <userId>/<ts>.<ext> and record it on the user's row
// via set_user_avatar (which re-checks self-or-manager authorization server-side,
// since a manager can't UPDATE another user's row directly). A unique filename
// per upload sidesteps CDN caching so a replaced photo shows immediately. Works
// for the signed-in user editing their own photo AND a manager setting a member's.
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      fileUri: string;
      ext?: string;
      businessId?: string; // when a manager sets a member's photo, for cache busting
    }): Promise<string> => {
      const ext = (input.ext ?? 'jpg').replace(/^\./, '').toLowerCase();
      const path = `${input.userId}/${Date.now()}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(input.fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = decode(base64);
      const contentType =
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const { error: upErr } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase.rpc('set_user_avatar', {
        p_target_user: input.userId,
        p_path: path,
      });
      if (error) throw error;
      return path;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['my-profile', vars.userId] });
      if (vars.businessId) {
        qc.invalidateQueries({ queryKey: ['team-members', vars.businessId] });
        qc.invalidateQueries({ queryKey: ['team-members-inactive', vars.businessId] });
      }
      // Provider pickers + calendar cards read avatars too.
      qc.invalidateQueries({ queryKey: ['bookable-providers'] });
      qc.invalidateQueries({ queryKey: ['bookable-providers-service'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
