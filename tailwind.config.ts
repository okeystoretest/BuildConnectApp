import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[class="light"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--bc-background))",
        surface: {
          DEFAULT: "hsl(var(--bc-surface))",
          2: "hsl(var(--bc-surface-2))",
          3: "hsl(var(--bc-surface-3))",
        },
        border: {
          DEFAULT: "hsl(var(--bc-border))",
          strong: "hsl(var(--bc-border-strong))",
        },
        foreground: "hsl(var(--bc-foreground))",
        muted: "hsl(var(--bc-muted))",
        primary: {
          DEFAULT: "hsl(var(--bc-primary))",
          hover: "hsl(var(--bc-primary-hover))",
          foreground: "hsl(var(--bc-primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--bc-accent))",
          soft: "hsl(var(--bc-accent-soft))",
        },
        info: "hsl(var(--bc-info))",
        warning: "hsl(var(--bc-warning))",
        danger: "hsl(var(--bc-danger))",
        ring: "hsl(var(--bc-ring))",
      },
      borderRadius: {
        lg: "var(--bc-radius)",
        md: "calc(var(--bc-radius) - 4px)",
        sm: "calc(var(--bc-radius) - 6px)",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      spacing: {
        sidebar: "17.5rem",
        "sidebar-collapsed": "4.5rem",
        topbar: "4.25rem",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "scale-in": "scale-in 160ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
