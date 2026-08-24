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
        // Entrada da área de conteúdo a cada troca de rota (setor/subsetor).
        "page-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Entrada do painel ao trocar de aba dentro do setor.
        "tab-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // Itens do menu de subsetores, em cascata.
        "item-in": {
          from: { opacity: "0", transform: "translateX(-6px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        // Popover de subsetores no modo retraído.
        "popover-in": {
          from: { opacity: "0", transform: "translateX(-8px) scale(0.96)" },
          to: { opacity: "1", transform: "translateX(0) scale(1)" },
        },
        // Barra de progresso da navegação (topo da tela).
        "nav-progress": {
          "0%": { transform: "translateX(-100%)" },
          "60%": { transform: "translateX(-25%)" },
          "100%": { transform: "translateX(-8%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "scale-in": "scale-in 160ms ease-out",
        "page-in": "page-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "tab-in": "tab-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "item-in": "item-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "popover-in": "popover-in 180ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "nav-progress": "nav-progress 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
