/** @type {import('next').NextConfig} */
const forbiddenPublicEnvNames = [
  ["NEXT_PUBLIC_SUPABASE_", "SERVICE", "_ROLE_KEY"],
  ["NEXT_PUBLIC_OPEN", "AI", "_API_KEY"],
  ["NEXT_PUBLIC_STRIPE_", "SE", "CRET_KEY"],
  ["NEXT_PUBLIC_STRIPE_WEBHOOK_", "SE", "CRET"],
].map((parts) => parts.join(""));

for (const name of forbiddenPublicEnvNames) {
  if (process.env[name]) {
    throw new Error(`Security error: remove sensitive key from public env (${name}).`);
  }
}

for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_") || typeof value !== "string") continue;
  const v = value.trim();
  if (!v) continue;
  if (
    /^sk_(live|test)_/i.test(v) ||
    /^rk_(live|test)_/i.test(v) ||
    /^whsec_/i.test(v) ||
    /^sb_secret_/i.test(v)
  ) {
    throw new Error(`Security error: secret-looking value detected in ${name}.`);
  }
}

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https:",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
