// Public values are inlined into the browser bundle by Next.js; they contain no secrets.
// Supabase now calls the anon key the "publishable key" — either variable name works.
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();

/** True when the Supabase project address and public key look usable. */
export function publicEnvReady(): boolean {
  return /^https?:\/\/[^/\s]+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
}

/** The app's own address, used in email links. On Vercel it falls back to the production domain. */
export function siteUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = process.env.NEXT_PUBLIC_SITE_URL || (vercel ? `https://${vercel}` : "");
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not set");
  return url.trim().replace(/\/+$/, "");
}

export function assertPublicEnv() {
  if (!publicEnvReady()) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}
