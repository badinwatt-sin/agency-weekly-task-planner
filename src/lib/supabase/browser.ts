"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client — used only to listen for live changes. Data access is still governed by RLS. */
export function getBrowserClient() {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
