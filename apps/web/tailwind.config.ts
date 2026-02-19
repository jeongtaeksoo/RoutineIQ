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
        popover: "hsl(var(--popover))",
        popoverFg: "hsl(var(--popover-fg))",
        primary: "hsl(var(--primary))",
        primaryFg: "hsl(var(--primary-fg))",
        secondary: "hsl(var(--secondary))",
        secondaryFg: "hsl(var(--secondary-fg))",
        muted: "hsl(var(--muted))",
        mutedFg: "hsl(var(--muted-fg))",
        accent: "hsl(var(--accent))",
        accentFg: "hsl(var(--accent-fg))",
        destructive: "hsl(var(--destructive))",
        destructiveFg: "hsl(var(--destructive-fg))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Legacy mappings
        brand: "hsl(var(--brand))",
        brandFg: "hsl(var(--brand-fg))"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(0,0,0,0.15)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;

