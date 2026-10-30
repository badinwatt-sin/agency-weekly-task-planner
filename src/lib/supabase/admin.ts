import "server-only";
import { createClient } from "@supabase/supabase-js";
import { assertPublicEnv, SUPABASE_URL } from "../env";

/**
 * SERVICE-ROLE client: bypasses row-level security. Use only in server code
 * AFTER the caller has been authorised (login lookup, Manager account admin).
 * The `server-only` import makes the build fail if this reaches the browser.
 */
export function createAdminClient() {
  assertPublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
