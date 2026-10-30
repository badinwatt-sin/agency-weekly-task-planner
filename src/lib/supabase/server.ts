import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertPublicEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

/**
 * Supabase client acting AS THE SIGNED-IN USER. Every query it makes is
 * checked by the database's row-level security policies.
 */
export async function createClient() {
  assertPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
  });
}
