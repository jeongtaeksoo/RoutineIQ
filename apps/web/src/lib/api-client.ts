"use client";

import { createClient } from "@/lib/supabase/client";

export type ApiFetchError = Error & {
  status?: number;
  hint?: string;
  code?: string;
};

export function isApiFetchError(err: unknown): err is ApiFetchError {
  return (
    err instanceof Error &&
    ("status" in (err as any) || "hint" in (err as any) || "code" in (err as any))
  );
}

type ApiErrorBody =
  | { message?: string; hint?: string; plan?: string; code?: string }
  | { detail?: unknown }
  | string;

function getApiOrigin(): string {
  const fallback = "http://localhost:8000";
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || fallback).trim();
  if (!raw) return fallback;

  // Guardrail: if someone sets `/api` (relative) we would accidentally call Next's own `/api/*` routes.
  // For local dev we always expect an absolute backend URL.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) return fallback;

  try {
    const u = new URL(raw);
    return u.origin; // strip any accidental `/api` suffix or path
  } catch {
    return fallback;
  }
}

function normalizeApiPath(path: string): string {
  let p = (path || "").trim();
  if (!p) return "/api";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) {
    throw new Error("apiFetch expects a path like '/logs', not a full URL");
  }

  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/^\/+/, "/");

  // Strip any leading `/api` prefix so we always end up with exactly one `/api/...`.
  // This prevents `/api/api/...` when env or callers are inconsistent.
  // Examples:
  // - "/api/logs" -> "/logs"
  // - "/api/api/logs" -> "/logs"
  // - "/logs" -> "/logs"
  while (p === "/api" || p === "/api/" || p.startsWith("/api/") || p.startsWith("/api?") || p.startsWith("/api#")) {
    if (p === "/api" || p === "/api/") {
      p = "";
      break;
    }
    p = p.slice(4) || "";
    if (p && !p.startsWith("/")) p = `/${p}`;
  }

  return `/api${p}`;
}

function normalizeError(body: ApiErrorBody): { message: string; hint?: string; code?: string } {
  // FastAPI commonly returns: { "detail": "..." } or { "detail": { message, hint, ... } }
  const payload =
    body && typeof body === "object" && "detail" in body ? (body as { detail?: unknown }).detail : body;

  if (typeof payload === "string" && payload.trim()) return { message: payload };
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const msg = obj.message ?? obj.error ?? obj.detail ?? "Request failed";
    const hint = obj.hint;
    const code = obj.code ?? obj.error_code ?? obj.sqlstate;
    return {
      message: typeof msg === "string" ? msg : String(msg),
      hint: typeof hint === "string" ? hint : hint != null ? String(hint) : undefined,
      code: typeof code === "string" ? code : code != null ? String(code) : undefined
    };
  }
  return { message: "Request failed" };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Single rule:
  // - `NEXT_PUBLIC_API_BASE_URL` may be `http://localhost:8000` or `http://localhost:8000/api` (either is fine).
  // - Callers should pass endpoint paths like `/logs`, `/reports?date=...`, `/stripe/status`, etc.
  // - We will always produce a final URL under `${origin}/api/...` with no duplicate `/api/api`.
  const origin = getApiOrigin();
  const url = `${origin}${normalizeApiPath(path)}`;

  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
      authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    let body: ApiErrorBody = "Request failed";
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // ignore
    }
    const { message, hint, code } = normalizeError(body);
    const err: ApiFetchError = new Error(message);
    err.status = res.status;
    if (hint) err.hint = hint;
    if (code) err.code = code;
    throw err;
  }

  return (await res.json()) as T;
}
