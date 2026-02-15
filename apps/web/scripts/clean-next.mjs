#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const nextDir = path.join(process.cwd(), ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
} catch (error) {
  // Build should proceed even if cache cleanup fails on ephemeral filesystem races.
  console.warn("[clean-next] unable to remove .next cache:", error instanceof Error ? error.message : String(error));
}
