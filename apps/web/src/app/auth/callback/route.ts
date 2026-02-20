import { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@/lib/safe-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function readNextFromCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const key = "routineiq_post_auth_next=";
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(key)) continue;
    const raw = trimmed.slice(key.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeInternalRedirectPath(searchParams.get("next") ?? readNextFromCookie(request));

  if (!isSupabaseConfigured()) {
    const fallback = NextResponse.redirect(`${origin}/login?error=supabase_env`);
    fallback.cookies.set("routineiq_post_auth_next", "", { path: "/", maxAge: 0 });
    return fallback;
  }

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const success = NextResponse.redirect(`${origin}${next}`);
      success.cookies.set("routineiq_post_auth_next", "", { path: "/", maxAge: 0 });
      return success;
    }
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
  }

  // Return to login on error
  const failure = NextResponse.redirect(`${origin}/login`);
  failure.cookies.set("routineiq_post_auth_next", "", { path: "/", maxAge: 0 });
  return failure;
}
