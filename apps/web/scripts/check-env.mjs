#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function loadLocalEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const runningInCiLike =
  Boolean(process.env.CI) ||
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.GITHUB_ACTIONS) ||
  Boolean(process.env.RENDER);

// Local dev convenience only. In CI/deploy, rely strictly on injected env.
if (!runningInCiLike) {
  loadLocalEnvFile(".env.local");
  loadLocalEnvFile(".env");
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const missing = required.filter((name) => !(process.env[name] || "").trim());
if (missing.length) {
  console.error("[env-check] Missing required public env:");
  for (const key of missing) console.error(`- ${key}`);
  if (runningInCiLike) {
    console.error("[env-check] Set these in Vercel Project Settings > Environment Variables (Preview + Production).");
  }
  process.exit(1);
}

const sensitivePublicKeys = Object.keys(process.env).filter((key) => {
  if (!key.startsWith("NEXT_PUBLIC_")) return false;
  if (key === "NEXT_PUBLIC_SUPABASE_URL") return false;
  if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") return false;
  return /(SERVICE_ROLE|SECRET|WEBHOOK|PRIVATE|OPENAI|STRIPE|JWT|PASSWORD)/i.test(key);
});
if (sensitivePublicKeys.length) {
  console.error("[env-check] Sensitive env keys must not be public (NEXT_PUBLIC_*):");
  for (const key of sensitivePublicKeys) console.error(`- ${key}`);
  process.exit(1);
}

const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
const vercelEnv = (process.env.VERCEL_ENV || "").toLowerCase();
const isDeploy = vercelEnv === "production" || vercelEnv === "preview";
const isProd = nodeEnv === "production" || isDeploy;
const enforceStrictApiBase = isProd || runningInCiLike;

const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
if (enforceStrictApiBase) {
  if (!apiBase) {
    console.error("[env-check] NEXT_PUBLIC_API_BASE_URL is required in CI/deploy builds.");
    console.error("[env-check] Example: https://api.rutineiq.com");
    process.exit(1);
  }
  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    console.error("[env-check] NEXT_PUBLIC_API_BASE_URL must be an absolute URL.");
    process.exit(1);
  }
  const host = (parsed.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    console.error("[env-check] NEXT_PUBLIC_API_BASE_URL cannot point to localhost in production/preview.");
    process.exit(1);
  }
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
if (enforceStrictApiBase) {
  if (!siteUrl) {
    console.error("[env-check] NEXT_PUBLIC_SITE_URL is required in CI/deploy builds.");
    console.error("[env-check] Example: https://rutineiq.com");
    process.exit(1);
  }
  let parsedSite;
  try {
    parsedSite = new URL(siteUrl);
  } catch {
    console.error("[env-check] NEXT_PUBLIC_SITE_URL must be an absolute URL.");
    process.exit(1);
  }
  const siteHost = (parsedSite.hostname || "").toLowerCase();
  if (siteHost === "localhost" || siteHost === "127.0.0.1") {
    console.error("[env-check] NEXT_PUBLIC_SITE_URL cannot point to localhost in production/preview.");
    process.exit(1);
  }
}

if (apiBase) {
  try {
    const parsed = new URL(apiBase);
    if (parsed.pathname && parsed.pathname !== "/" && parsed.pathname !== "/api") {
      console.warn("[env-check] NEXT_PUBLIC_API_BASE_URL should be origin or origin/api. Current path:", parsed.pathname);
    }
  } catch {
    // already handled in production; in local dev we stay permissive.
  }
}

console.log("[env-check] OK");
