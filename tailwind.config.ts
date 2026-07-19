import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Indigo Nocturne — see DESIGN.md
        night: "#0E1420",
        surface: "#182236",
        surface2: "#1E2A42",
        cloud: "#EDEFF4",
        mist: "#8A94A6",
        dawn: "#E9B384",
        "dawn-deep": "#C98B6B",
        sage: "#7FA08C",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        breath: {
          "0%,100%": { opacity: "0.5", transform: "translateX(-50%) scale(1)" },
          "50%": { opacity: "1", transform: "translateX(-50%) scale(1.25)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        settle: {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.99)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        breath: "breath 4s ease-in-out infinite",
        rise: "rise 600ms ease-out both",
        settle: "settle 550ms ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
