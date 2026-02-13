import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const e2eMode = process.env.E2E_MODE === "live" ? "live" : "mock";
const webServerCommand =
  e2eMode === "live"
    ? "npm run build && NEXT_PUBLIC_E2E_TEST_MODE=0 npm run start:e2e"
    : "npm run build && NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.local NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon-key NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 NEXT_PUBLIC_E2E_TEST_MODE=1 E2E_TEST_MODE=1 npm run start:e2e";
const webServerEnv: Record<string, string> = {
  NEXT_TELEMETRY_DISABLED: "1",
  E2E_MODE: e2eMode,
};
if (e2eMode === "mock") {
  webServerEnv.NEXT_PUBLIC_SUPABASE_URL = "https://e2e.supabase.local";
  webServerEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-anon-key";
  webServerEnv.NEXT_PUBLIC_API_BASE_URL = baseURL;
  webServerEnv.NEXT_PUBLIC_E2E_TEST_MODE = "1";
} else if (process.env.NEXT_PUBLIC_API_BASE_URL) {
  webServerEnv.NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
  webServerEnv.NEXT_PUBLIC_ENABLE_TOKEN_BRIDGE = "1";
  webServerEnv.NEXT_PUBLIC_E2E_TEST_MODE = "0";
}
if (e2eMode === "live" && !webServerEnv.NEXT_PUBLIC_ENABLE_TOKEN_BRIDGE) {
  webServerEnv.NEXT_PUBLIC_ENABLE_TOKEN_BRIDGE = "1";
  webServerEnv.NEXT_PUBLIC_E2E_TEST_MODE = "0";
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: webServerCommand,
    port,
    timeout: 180_000,
    reuseExistingServer: false,
    env: webServerEnv,
  },
});
