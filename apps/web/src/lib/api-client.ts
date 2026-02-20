"use client";

import { createClient } from "@/lib/supabase/client";
import { isE2ETestMode } from "@/lib/supabase/env";

export type ApiFetchError = Error & {
  status?: number;
  hint?: string;
  code?: string;
  correlationId?: string;
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

export type ApiFetchInit = RequestInit & {
  timeoutMs?: number;
  retryOnTimeout?: boolean;
  _retryAttempt?: number;
};

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;
let pendingAccessTokenPromise: Promise<string | null> | null = null;

function getApiOrigin(): string {
  const fallback = "http://localhost:8000";
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  const runtimeFallback = getRuntimeApiFallback();
  const browserHost = getBrowserHost();
  const browserOnLocal = isBrowserLocalhost(browserHost);
  const nonLocalDefault = "https://api.rutineiq.com";
  if (!raw) {
    if (!browserOnLocal) return runtimeFallback || nonLocalDefault;
    return fallback;
  }

  // Guardrail: if someone sets `/api` (relative) we would accidentally call Next's own `/api/*` routes.
  // For local dev we always expect an absolute backend URL.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    if (!browserOnLocal) return runtimeFallback || nonLocalDefault;
    return fallback;
  }

  try {
    const u = new URL(raw);
    const origin = u.origin; // strip any accidental `/api` suffix or path
    if (isLocalOrigin(origin) && !browserOnLocal) {
      // Never allow non-local browser sessions to hit localhost.
      return runtimeFallback || nonLocalDefault;
    }
    return origin;
  } catch {
    if (!browserOnLocal) return runtimeFallback || nonLocalDefault;
    return fallback;
  }
}

function getRuntimeApiFallback(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === "rutineiq.com" || host === "www.rutineiq.com" || host.endsWith(".rutineiq.com")) {
    return "https://api.rutineiq.com";
  }
  return null;
}

function getBrowserHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

function isBrowserLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

function isLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
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

function getBridgeToken(): string | null {
  if (typeof window === "undefined") return null;
  const bridgeWindow = (window as any).__ROUTINEIQ_E2E_TOKEN__;
  const bridgeSession = window.sessionStorage.getItem("routineiq_e2e_token");
  return typeof bridgeWindow === "string" && bridgeWindow ? bridgeWindow : bridgeSession || null;
}

async function fetchServerToken(timeoutMs = 3500): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const tokenRes = await fetch("/auth/token", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!tokenRes.ok) return null;
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    return typeof tokenBody.access_token === "string" ? tokenBody.access_token : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function isServerTokenFallbackEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SERVER_TOKEN_FALLBACK === "1";
}

async function resolveAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }
  if (pendingAccessTokenPromise) {
    return pendingAccessTokenPromise;
  }

  pendingAccessTokenPromise = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);

    let session = data.session ?? null;
    if (!session) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw new Error(refreshed.error.message);
      session = refreshed.data.session ?? null;
    }

    if (session?.access_token) {
      cachedAccessToken = session.access_token;
      cachedAccessTokenExpiresAt = (session.expires_at ? session.expires_at * 1000 : now + 60_000) - 10_000;
      return session.access_token;
    }

    const bridgeToken = process.env.NEXT_PUBLIC_ENABLE_TOKEN_BRIDGE === "1" ? getBridgeToken() : null;
    if (bridgeToken) {
      cachedAccessToken = bridgeToken;
      cachedAccessTokenExpiresAt = now + 60_000;
      return bridgeToken;
    }

    if (isServerTokenFallbackEnabled()) {
      const serverToken = await fetchServerToken();
      if (serverToken) {
        cachedAccessToken = serverToken;
        cachedAccessTokenExpiresAt = now + 60_000;
        return serverToken;
      }
    }

    return null;
  })();

  try {
    return await pendingAccessTokenPromise;
  } finally {
    pendingAccessTokenPromise = null;
  }
}

function createCorrelationId(): string {
  const globalCrypto = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `rq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  // Single rule:
  // - `NEXT_PUBLIC_API_BASE_URL` may be `http://localhost:8000` or `http://localhost:8000/api` (either is fine).
  // - Callers should pass endpoint paths like `/logs`, `/reports?date=...`, `/stripe/status`, etc.
  // - We will always produce a final URL under `${origin}/api/...` with no duplicate `/api/api`.
  let origin = getApiOrigin();
  // Last-resort safety: a deployed browser must never call localhost.
  if (typeof window !== "undefined") {
    const browserHost = window.location.hostname.toLowerCase();
    if (!isBrowserLocalhost(browserHost) && isLocalOrigin(origin)) {
      origin = getRuntimeApiFallback() || "https://api.rutineiq.com";
    }
  }
  const url = `${origin}${normalizeApiPath(path)}`;
  const isE2EMode = isE2ETestMode();
  const headers = new Headers(init?.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("x-correlation-id")) {
    headers.set("x-correlation-id", createCorrelationId());
  }

  if (!isE2EMode) {
    const token = await resolveAccessToken();
    if (!token) throw new Error("Not signed in");
    headers.set("authorization", `Bearer ${token}`);
  }

  const method = String(init?.method || "GET").toUpperCase();
  const retryAttempt = Number.isFinite(Number(init?._retryAttempt)) ? Number(init?._retryAttempt) : 0;
  const canRetry = method === "GET" || method === "HEAD" || method === "DELETE";
  const explicitTimeout = typeof init?.timeoutMs === "number";
  const timeoutMs =
    typeof init?.timeoutMs === "number"
      ? Math.max(1_000, Number(init.timeoutMs))
      : method === "GET" || method === "HEAD"
        ? 12_000
        : 45_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, retryOnTimeout: _retryOnTimeout, _retryAttempt: _retryAttempt, ...requestInit } = init ?? {};
  void _timeoutMs;
  void _retryOnTimeout;
  void _retryAttempt;

  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...requestInit,
      headers,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      const retryEnabled =
        init?.retryOnTimeout === true ||
        (init?.retryOnTimeout !== false && !explicitTimeout);
      const shouldRetryOnTimeout =
        canRetry &&
        retryAttempt < 1 &&
        !(init?.signal?.aborted) &&
        retryEnabled;
      if (shouldRetryOnTimeout) {
        return apiFetch<T>(path, {
          ...init,
          timeoutMs: Math.min(Math.round(timeoutMs * 1.5), 20_000),
          _retryAttempt: retryAttempt + 1,
        });
      }
      const timeoutErr: ApiFetchError = new Error(
        "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요. Request timed out. Please retry."
      );
      timeoutErr.status = 504;
      timeoutErr.code = "timeout";
      timeoutErr.correlationId = headers.get("x-correlation-id") || undefined;
      throw timeoutErr;
    }
    const networkErr: ApiFetchError =
      err instanceof Error ? (err as ApiFetchError) : new Error("Network request failed");
    if (!networkErr.correlationId) {
      networkErr.correlationId = headers.get("x-correlation-id") || undefined;
    }
    throw networkErr;
  } finally {
    clearTimeout(timeoutId);
  }
  const responseCorrelationId = res.headers.get("x-correlation-id") || headers.get("x-correlation-id") || undefined;

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
    if (responseCorrelationId) err.correlationId = responseCorrelationId;
    throw err;
  }

  return (await res.json()) as T;
}
