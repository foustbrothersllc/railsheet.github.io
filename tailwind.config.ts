import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        yard: {
          bg: "#0E1114",
          surface: "#171B20",
          panel: "#1E232A",
          border: "#2B323B",
          borderLight: "#394250",
          text: "#EDEFF2",
          muted: "#8A94A3",
          faint: "#5C6472",
        },
        amber: {
          DEFAULT: "#F5A623",
          dim: "#8A5F1B",
        },
        depart: {
          DEFAULT: "#4E8CFF",
          dim: "#2E4A80",
        },
        danger: {
          DEFAULT: "#E5484D",
          dim: "#7A2529",
        },
        okay: {
          DEFAULT: "#3DDC84",
          dim: "#1E6B41",
        },
        hot: {
          DEFAULT: "#FF6B35",
          dim: "#8A3B1D",
        },
        // Staged/upcoming-train trailers — distinct from the amber used for
        // regular At Rail trailers, so a card's left stripe alone tells you
        // it's part of a not-yet-promoted train.
        train: {
          DEFAULT: "#9B6BFF",
          dim: "#4A3380",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        stencil: ["var(--font-stencil)", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        slideUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        pulseSlow: "pulseSlow 2s ease-in-out infinite",
        slideUp: "slideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        fadeIn: "fadeIn 0.15s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
