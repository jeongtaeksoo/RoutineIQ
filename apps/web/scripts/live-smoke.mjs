#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function inferStripeModeFromKey(key) {
  if (typeof key !== "string") return "unknown";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "unknown";
}

function inferStripeModeFromPrice(priceId) {
  if (typeof priceId !== "string") return "unknown";
  if (priceId.includes("_test_")) return "test";
  if (priceId.includes("_live_")) return "live";
  if (priceId.startsWith("price_")) return "unknown";
  return "unknown";
}

function inferUrlHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayUtcYmd() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(ymd, delta) {
  const [y, m, d] = ymd.split("-").map((v) => Number(v));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function makeSignature(secret, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const digest = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function main() {
  const root = path.resolve(process.cwd(), "..", "..");
  loadEnvFile(path.join(root, "apps", "web", ".env.local"));
  loadEnvFile(path.join(root, "apps", "api", ".env"));

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const apiBaseRaw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").trim();
  const apiBase = apiBaseRaw.replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const stripeWebhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  const stripePriceIdPro = requireEnv("STRIPE_PRICE_ID_PRO");
  const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
  const stripeSmokeFake = (process.env.STRIPE_SMOKE_FAKE || "").trim() === "1";

  if (!stripeSmokeFake) {
    const keyMode = inferStripeModeFromKey(stripeSecretKey);
    const priceMode = inferStripeModeFromPrice(stripePriceIdPro);
    if (keyMode === "unknown" || priceMode === "unknown" || keyMode !== priceMode) {
      throw new Error(`stripe mode mismatch: key=${keyMode}, price=${priceMode}`);
    }
    const successHost = inferUrlHost(requireEnv("STRIPE_SUCCESS_URL"));
    const cancelHost = inferUrlHost(requireEnv("STRIPE_CANCEL_URL"));
    if (!successHost || !cancelHost || successHost !== cancelHost) {
      throw new Error("stripe success/cancel URL host mismatch");
    }
  }

  const sb1 = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const sb2 = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

  const s1 = await sb1.auth.signInAnonymously();
  if (s1.error || !s1.data.session?.access_token || !s1.data.user?.id) {
    throw new Error("Anonymous sign-in failed for user #1");
  }
  const user1Token = s1.data.session.access_token;
  const user1Id = s1.data.user.id;

  const s2 = await sb2.auth.signInAnonymously();
  if (s2.error || !s2.data.session?.access_token || !s2.data.user?.id) {
    throw new Error("Anonymous sign-in failed for user #2");
  }
  const user2Token = s2.data.session.access_token;
  const user2Id = s2.data.user.id;

  const date = todayYmd();
  const date2 = addDaysYmd(date, -1);

  const sampleEntries = [
    { start: "09:00", end: "09:30", activity: "Planning + setup", energy: 3, focus: 3, tags: ["planning"], note: null },
    { start: "09:30", end: "10:30", activity: "Deep work sprint", energy: 4, focus: 5, tags: ["deep-work"], note: null },
    { start: "11:00", end: "12:00", activity: "Meetings / collaboration", energy: 3, focus: 3, tags: ["meeting"], note: null },
  ];

  // G3: own CRUD via API.
  const save1 = await fetchJson(`${apiBase}/api/logs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user1Token}` },
    body: JSON.stringify({ date, entries: sampleEntries, note: "live smoke user1" }),
  });
  if (!save1.ok) throw new Error(`user1 save failed (${save1.status})`);

  const save2 = await fetchJson(`${apiBase}/api/logs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user2Token}` },
    body: JSON.stringify({ date: date2, entries: sampleEntries, note: "live smoke user2" }),
  });
  if (!save2.ok) throw new Error(`user2 save failed (${save2.status})`);

  const profilePrime = await fetchJson(`${apiBase}/api/preferences/profile`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${user1Token}` },
    body: JSON.stringify({
      age_group: "25_34",
      gender: "prefer_not_to_say",
      job_family: "engineering",
      work_mode: "fixed",
      chronotype: "mixed",
      trend_opt_in: true,
      trend_compare_by: ["age_group", "job_family", "work_mode"],
      goal_keyword: "deep work",
      goal_minutes_per_day: 90,
    }),
  });
  if (!profilePrime.ok) throw new Error(`profile prime failed (${profilePrime.status})`);

  const analyze = await fetchJson(`${apiBase}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${user1Token}` },
    body: JSON.stringify({ date, force: true }),
  });
  if (!analyze.ok) throw new Error(`analyze failed (${analyze.status})`);

  const report = await fetchJson(`${apiBase}/api/reports?date=${encodeURIComponent(date)}`, {
    method: "GET",
    headers: { authorization: `Bearer ${user1Token}` },
  });
  if (!report.ok || !report.json?.report?.coach_one_liner || !report.json?.report?.summary) {
    throw new Error(`report fetch/schema failed (${report.status})`);
  }

  // G3: usage_events recorded.
  const usageUrl =
    `${supabaseUrl}/rest/v1/usage_events` +
    `?select=id,user_id,event_type,event_date,tokens_total,cost_usd` +
    `&user_id=eq.${encodeURIComponent(user1Id)}` +
    `&event_type=eq.analyze` +
    `&event_date=in.(${Array.from(new Set([date, todayUtcYmd()])).map(encodeURIComponent).join(",")})` +
    `&order=created_at.desc&limit=1`;
  const usage = await fetchJson(usageUrl, {
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!usage.ok || !Array.isArray(usage.json) || usage.json.length < 1) {
    throw new Error("usage_events missing for analyze call");
  }

  // G3: RLS - own read allowed / others blocked.
  const ownRead = await fetchJson(
    `${supabaseUrl}/rest/v1/activity_logs?select=id,user_id,date&user_id=eq.${encodeURIComponent(user1Id)}&limit=1`,
    { headers: { apikey: supabaseAnonKey, authorization: `Bearer ${user1Token}` } },
  );
  if (!ownRead.ok || !Array.isArray(ownRead.json) || ownRead.json.length < 1) {
    throw new Error("RLS own-read check failed");
  }

  const crossRead = await fetchJson(
    `${supabaseUrl}/rest/v1/activity_logs?select=id,user_id,date&user_id=eq.${encodeURIComponent(user2Id)}&limit=1`,
    { headers: { apikey: supabaseAnonKey, authorization: `Bearer ${user1Token}` } },
  );
  if (!crossRead.ok || !Array.isArray(crossRead.json) || crossRead.json.length !== 0) {
    throw new Error("RLS cross-user read blocking failed");
  }

  // G3: admin endpoint denied for non-admin.
  const adminDenied = await fetchJson(`${apiBase}/api/admin/users`, {
    method: "GET",
    headers: { authorization: `Bearer ${user1Token}` },
  });
  if (adminDenied.status !== 403) {
    throw new Error(`admin access guard failed (${adminDenied.status})`);
  }

  // G4: create a billable email user (non-anonymous) for checkout flow.
  const billEmail = `smoke+${Date.now()}@routineiq.test`;
  const billPassword = `Rtq!${Date.now()}Xx`;
  const createBillUser = await fetchJson(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      email: billEmail,
      password: billPassword,
      email_confirm: true,
      user_metadata: { source: "live-smoke" },
    }),
  });
  if (!createBillUser.ok) {
    throw new Error(`billable user create failed (${createBillUser.status})`);
  }

  const sbBill = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const relogin = await sbBill.auth.signInWithPassword({ email: billEmail, password: billPassword });
  if (relogin.error || !relogin.data.session?.access_token || !relogin.data.user?.id) {
    throw new Error("billable login failed");
  }
  const billToken = relogin.data.session.access_token;
  const billUserId = relogin.data.user.id;

  const stripeStatus = await fetchJson(`${apiBase}/api/stripe/status`, {
    headers: { authorization: `Bearer ${billToken}` },
  });
  if (!stripeStatus.ok || stripeStatus.json?.enabled !== true) {
    throw new Error(`stripe status check failed (${stripeStatus.status}) ${JSON.stringify(stripeStatus.json)}`);
  }
  if (
    stripeStatus.json &&
    Object.prototype.hasOwnProperty.call(stripeStatus.json, "ready") &&
    stripeStatus.json.ready !== true
  ) {
    throw new Error(`stripe status not ready (${stripeStatus.status}) ${JSON.stringify(stripeStatus.json)}`);
  }

  const checkout = await fetchJson(`${apiBase}/api/stripe/create-checkout-session`, {
    method: "POST",
    headers: { authorization: `Bearer ${billToken}` },
  });
  const checkoutUrl = checkout.json?.url;
  const stripeMode = stripeStatus.json?.mode;
  const checkoutLooksValid =
    typeof checkoutUrl === "string" &&
    (stripeMode === "fake" ? checkoutUrl.startsWith("http") : checkoutUrl.includes("stripe.com"));
  if (!checkout.ok || !checkoutLooksValid) {
    throw new Error(`checkout session failed (${checkout.status})`);
  }

  // G4: webhook signature verification + subscription sync.
  const event = {
    id: `evt_smoke_${Date.now()}`,
    object: "event",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: `sub_smoke_${Date.now()}`,
        object: "subscription",
        customer: `cus_smoke_${Date.now()}`,
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
        metadata: { user_id: billUserId },
        items: {
          object: "list",
          data: [{ id: "si_smoke_1", object: "subscription_item", price: { id: stripePriceIdPro } }],
        },
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = makeSignature(stripeWebhookSecret, payload);

  const webhook = await fetchJson(`${apiBase}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
  if (!webhook.ok) {
    throw new Error(`webhook verification failed (${webhook.status})`);
  }

  const subCheck = await fetchJson(
    `${supabaseUrl}/rest/v1/subscriptions?select=user_id,plan,status,stripe_subscription_id&user_id=eq.${encodeURIComponent(
      billUserId,
    )}&limit=1`,
    { headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!subCheck.ok || !Array.isArray(subCheck.json) || subCheck.json.length < 1) {
    throw new Error("subscription sync row missing");
  }
  const sub = subCheck.json[0];
  if (sub.plan !== "pro" || sub.status !== "active") {
    throw new Error("subscription sync state mismatch");
  }

  console.log("LIVE_SMOKE_OK");
}

main().catch((err) => {
  console.error("LIVE_SMOKE_FAIL");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
