// Public values are inlined into the browser bundle by Next.js; they contain no secrets.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not set");
  return url.replace(/\/$/, "");
}

export function assertPublicEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}
