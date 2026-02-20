const INTERNAL_REDIRECT_ORIGIN = "https://rutineiq.internal";

export function sanitizeInternalRedirectPath(
  path: string | null | undefined,
  fallback = "/app"
): string {
  const raw = (path || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  try {
    const parsed = new URL(raw, INTERNAL_REDIRECT_ORIGIN);
    if (parsed.origin !== INTERNAL_REDIRECT_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
