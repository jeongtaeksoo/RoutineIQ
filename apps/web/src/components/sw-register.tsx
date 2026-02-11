"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    // Avoid service worker caching headaches during local dev.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort; app should work without PWA.
    });
  }, []);

  return null;
}

