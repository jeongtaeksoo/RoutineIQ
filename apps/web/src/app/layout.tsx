import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SWRegister } from "@/components/sw-register";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";

import "./globals.css";

const metadataBase = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  try {
    return new URL(raw || "https://rutineiq.com");
  } catch {
    return new URL("https://rutineiq.com");
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "RutineIQ",
    template: "%s · RutineIQ"
  },
  description:
    "AI routine operations: analyze your Daily Flow to find peak hours, focus break triggers, and generate a smarter tomorrow schedule.",
  openGraph: {
    title: "RutineIQ",
    description:
      "Analyze your Daily Flow to find peak hours, focus break triggers, and generate a smarter tomorrow schedule.",
    url: "/",
    siteName: "RutineIQ",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "RutineIQ",
    description:
      "Analyze your Daily Flow to find peak hours, focus break triggers, and generate a smarter tomorrow schedule."
  },
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" style={{ colorScheme: "light" }}>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1100px_circle_at_12%_10%,rgba(217,179,155,0.15),transparent_40%),radial-gradient(900px_circle_at_86%_16%,rgba(200,170,150,0.12),transparent_38%),radial-gradient(950px_circle_at_52%_102%,rgba(180,160,140,0.10),transparent_46%)]" />
        <WebVitalsReporter />
        <SWRegister />
        {children}
      </body>
    </html>
  );
}
