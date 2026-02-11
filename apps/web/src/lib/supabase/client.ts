import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const env = getSupabasePublicEnv();
  if (!env.configured || !env.url || !env.anonKey) {
    // Friendly, non-leaky message. UI should gate on this and show setup instructions.
    throw new Error("Supabase env not configured");
  }
  return createBrowserClient(env.url, env.anonKey);
}
