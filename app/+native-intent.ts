import { rewriteWalkInLink } from '@/lib/walkInLogic';

// Incoming links, before expo-router matches them to a route. The only rewrite:
// a shop's walk-in QR is the public booking link with ?walkin=1
// (https://theluxmirror.com/book/<id>?walkin=1), which would otherwise open
// the booking wizard. Everything else passes through untouched.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return rewriteWalkInLink(path);
  } catch {
    // Never throw here — it would crash the app on launch.
    return path;
  }
}
