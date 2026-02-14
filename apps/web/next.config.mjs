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
  reactStrictMode: true
};

export default nextConfig;
