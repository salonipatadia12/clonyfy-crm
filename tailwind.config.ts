import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const token = (name: string) => `hsl(var(--${name}))`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: token("card"),
        "card-foreground": token("card-foreground"),
        popover: token("popover"),
        "popover-foreground": token("popover-foreground"),
        primary: token("primary"),
        "primary-foreground": token("primary-foreground"),
        secondary: token("secondary"),
        "secondary-foreground": token("secondary-foreground"),
        muted: token("muted"),
        "muted-foreground": token("muted-foreground"),
        accent: token("accent"),
        "accent-foreground": token("accent-foreground"),
        success: token("success"),
        "success-foreground": token("success-foreground"),
        warning: token("warning"),
        "warning-foreground": token("warning-foreground"),
        destructive: token("destructive"),
        "destructive-foreground": token("destructive-foreground"),
        brand: token("brand"),
        "brand-foreground": token("brand-foreground"),
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
      },
      borderRadius: {
        xl: "calc(var(--radius) + 2px)",  // 12px cards
        lg: "var(--radius)",              // 11px
        md: "calc(var(--radius) - 3px)",  // 8px controls
        sm: "calc(var(--radius) - 5px)",  // 6px chips
      },
      fontSize: {
        // A tighter scale than the default — dense tables, clear hierarchy.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out both",
      },
    },
  },
  plugins: [animate],
};
export default config;
