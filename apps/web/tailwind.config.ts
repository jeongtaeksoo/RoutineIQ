import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      spacing: {
        'bottom-nav': 'var(--bottom-nav-height)',
        'bottom-safe': 'var(--space-bottom-safe)',
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"]
      },
      colors: {
        bg: "hsl(var(--bg))",
        fg: "hsl(var(--fg))",
        card: "hsl(var(--card))",
        cardFg: "hsl(var(--card-fg))",
        muted: "hsl(var(--muted))",
        mutedFg: "hsl(var(--muted-fg))",
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        brand: "hsl(var(--brand))",
        brandFg: "hsl(var(--brand-fg))"
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(0,0,0,0.25)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;

