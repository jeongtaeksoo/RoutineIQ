export type SupabasePublicEnv = {
  url?: string;
  anonKey?: string;
  configured: boolean;
};

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey)
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv().configured;
}

export function isE2ETestMode(): boolean {
  return process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";
}
